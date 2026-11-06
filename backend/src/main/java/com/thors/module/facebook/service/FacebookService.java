package com.thors.module.facebook.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import java.io.File;
import java.io.FileWriter;
import java.io.PrintWriter;
import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.security.SessionAccess;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.Collectors;

@Service
public class FacebookService {

    private static final Logger log = LoggerFactory.getLogger(FacebookService.class);

    @Value("${thors.facebook.page-token:}")
    private String pageToken;

    @Value("${thors.facebook.page-id:1375988095602878}")
    private String pageId;

    private final JdbcTemplate jdbc;
    private final SessionAccess sessionAccess;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public FacebookService(
            @Autowired(required = false) JdbcTemplate jdbc,
            @Autowired(required = false) SessionAccess sessionAccess) {
        this.jdbc = jdbc;
        this.sessionAccess = sessionAccess;
    }

    // Lưu danh sách tin nhắn nhận được gần đây (in-memory)
    private final List<Map<String, Object>> recentMessages = new CopyOnWriteArrayList<>();

    // Map các cuộc trò chuyện theo PSID của khách hàng
    private final Map<String, Map<String, Object>> conversations = new ConcurrentHashMap<>();

    // Cache profile khách hàng để không phải gọi Graph API nhiều lần
    private final Map<String, Map<String, String>> profileCache = new ConcurrentHashMap<>();

    /**
     * Lấy Tên thật và Ảnh đại diện thật của khách hàng từ Facebook Graph API
     */
    public Map<String, String> fetchCustomerProfile(String psid) {
        if (profileCache.containsKey(psid)) {
            Map<String, String> cached = profileCache.get(psid);
            if (cached != null && cached.containsKey("name") && !cached.get("name").startsWith("Khách FB")) {
                return cached;
            }
        }

        if (pageToken == null || pageToken.isBlank() || psid == null) {
            return Map.of("name",
                    "Khách FB #" + (psid != null && psid.length() > 6 ? psid.substring(psid.length() - 6) : psid),
                    "avatar", "");
        }

        try {
            String url = "https://graph.facebook.com/v21.0/" + psid
                    + "?fields=name,first_name,last_name,profile_pic&access_token=" + pageToken;
            Map<String, Object> resp = restTemplate.getForObject(url, Map.class);
            if (resp != null && resp.containsKey("name")) {
                String name = String.valueOf(resp.get("name"));
                String avatar = resp.get("profile_pic") != null ? String.valueOf(resp.get("profile_pic")) : "";
                Map<String, String> profile = Map.of("name", name, "avatar", avatar);
                profileCache.put(psid, profile);
                log.info("==> Đã lấy thông tin khách hàng từ Facebook: {} ({})", name, psid);
                return profile;
            }
        } catch (Exception e) {
            log.warn("Không lấy được profile khách {}: {}", psid, e.getMessage());
        }

        return Map.of(
                "name", "Khách FB #" + (psid.length() > 6 ? psid.substring(psid.length() - 6) : psid),
                "avatar", "");
    }

    /**
     * Xử lý webhook payload từ Facebook đẩy về
     */
    public void processWebhookPayload(Map<String, Object> payload) {
        try {
            log.info("==> Đang xử lý sự kiện Facebook Webhook: {}", payload);
            logToFile(payload);

            List<Map<String, Object>> entries = (List<Map<String, Object>>) payload.get("entry");
            if (entries == null || entries.isEmpty()) {
                return;
            }

            for (Map<String, Object> entry : entries) {
                List<Map<String, Object>> messagingList = (List<Map<String, Object>>) entry.get("messaging");
                if (messagingList == null)
                    continue;

                for (Map<String, Object> messaging : messagingList) {
                    Map<String, Object> sender = (Map<String, Object>) messaging.get("sender");
                    Map<String, Object> recipient = (Map<String, Object>) messaging.get("recipient");
                    Map<String, Object> message = (Map<String, Object>) messaging.get("message");

                    if (sender == null || message == null)
                        continue;

                    String senderPsid = String.valueOf(sender.get("id"));
                    String text = message.get("text") != null ? String.valueOf(message.get("text")) : "";
                    String mid = message.get("mid") != null ? String.valueOf(message.get("mid"))
                            : UUID.randomUUID().toString();

                    // Bỏ qua tin nhắn do chính Page gửi ra
                    if (pageId != null && pageId.equals(senderPsid)) {
                        continue;
                    }

                    // Lấy profile thật của khách hàng (Tên + Avatar)
                    Map<String, String> profile = fetchCustomerProfile(senderPsid);
                    String customerName = profile.getOrDefault("name", "Khách Facebook");
                    String customerAvatar = profile.getOrDefault("avatar", "");

                    Map<String, Object> msgRecord = new HashMap<>();
                    msgRecord.put("mid", mid);
                    msgRecord.put("senderPsid", senderPsid);
                    msgRecord.put("senderName", customerName);
                    msgRecord.put("senderAvatar", customerAvatar);
                    msgRecord.put("text", text);
                    msgRecord.put("timestamp",
                            LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss dd/MM/yyyy")));
                    msgRecord.put("from", "CUSTOMER");

                    recentMessages.add(msgRecord);

                    // Cập nhật cuộc hội thoại
                    conversations.compute(senderPsid, (k, v) -> {
                        Map<String, Object> conv = v != null ? v : new HashMap<>();
                        conv.put("psid", senderPsid);
                        conv.put("name", customerName);
                        conv.put("avatar", customerAvatar);
                        conv.put("lastMessage", text);
                        conv.put("lastTimestamp",
                                LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss dd/MM/yyyy")));
                        conv.put("unreadCount", ((Integer) conv.getOrDefault("unreadCount", 0)) + 1);
                        return conv;
                    });

                    log.info("==> [TIN NHẮN TỪ KHÁCH HÀNG: {}] (PSID={}): {}", customerName, senderPsid, text);
                }
            }
        } catch (Exception e) {
            log.error("Lỗi khi xử lý sự kiện Facebook Webhook", e);
        }
    }

    /**
     * Gửi tin nhắn trả lời khách hàng qua Messenger API (trả về chi tiết kết quả)
     */
    public Map<String, Object> sendMessageToCustomerWithDetails(String recipientPsid, String text) {
        if (pageToken == null || pageToken.isBlank()) {
            log.warn("Chưa cấu hình thors.facebook.page-token, không thể gửi tin nhắn");
            return Map.of("success", false, "error", "Chưa cấu hình Facebook Page Token trên hệ thống.");
        }

        try {
            String url = "https://graph.facebook.com/v21.0/me/messages?access_token=" + pageToken;

            Map<String, Object> body = Map.of(
                    "recipient", Map.of("id", recipientPsid),
                    "message", Map.of("text", text));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("==> Gửi tin nhắn thành công tới PSID {}: {}", recipientPsid, text);

                String nowIso = java.time.Instant.now().toString();
                String formattedTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss dd/MM/yyyy"));

                // Lấy message_id thật do Facebook trả về
                String fbMid = null;
                try {
                    Map<String, Object> respMap = objectMapper.readValue(response.getBody(), Map.class);
                    if (respMap != null && respMap.containsKey("message_id")) {
                        fbMid = String.valueOf(respMap.get("message_id"));
                    }
                } catch (Exception ignored) {
                }
                String finalMid = (fbMid != null && !fbMid.isBlank()) ? fbMid : UUID.randomUUID().toString();

                Map<String, Object> sentRecord = new HashMap<>();
                sentRecord.put("mid", finalMid);
                sentRecord.put("senderPsid", recipientPsid);
                sentRecord.put("senderName", "THORS Studio");
                sentRecord.put("text", text);
                sentRecord.put("rawTime", nowIso);
                sentRecord.put("timestamp", formattedTime);
                sentRecord.put("from", "SHOP");
                recentMessages.add(sentRecord);

                // Cập nhật tin nhắn gần nhất vào danh sách hội thoại
                conversations.computeIfPresent(recipientPsid, (k, conv) -> {
                    conv.put("lastMessage", "Bạn: " + text);
                    conv.put("lastTimestamp", formattedTime);
                    return conv;
                });

                return Map.of("success", true, "mid", finalMid);
            }
        } catch (Exception e) {
            log.error("Lỗi khi gọi Facebook Send API tới PSID " + recipientPsid, e);
            String errMsg = "Lỗi gửi tin qua Facebook.";
            if (e instanceof org.springframework.web.client.HttpStatusCodeException se) {
                String respBody = se.getResponseBodyAsString();
                log.error("Facebook API error body: {}", respBody);
                if (respBody.contains("2018278") || respBody.contains("ngoài khoảng thời gian cho phép")
                        || respBody.contains("outside the allowed window")) {
                    errMsg = "Khách hàng đã quá 24h chưa gửi tin nhắn mới cho Fanpage (chính sách bảo vệ 24h của Meta). Hãy nhờ khách gửi 1 tin bất kỳ (như 'alo' hoặc '.') vào Fanpage để mở lại cửa sổ gửi tin nhắn!";
                } else {
                    errMsg = "Meta Graph API lỗi: " + se.getStatusCode();
                }
            }
            return Map.of("success", false, "error", errMsg);
        }
        return Map.of("success", false, "error", "Không thể gửi tin nhắn tới Facebook.");
    }

    /**
     * Gửi tin nhắn trả lời khách hàng qua Messenger API
     */
    public boolean sendMessageToCustomer(String recipientPsid, String text) {
        Map<String, Object> res = sendMessageToCustomerWithDetails(recipientPsid, text);
        return Boolean.TRUE.equals(res.get("success"));
    }

    /**
     * Gửi hình ảnh (Mã QR VietQR / hình ảnh sản phẩm) tới khách hàng qua Facebook
     * Messenger API
     */
    public boolean sendImageToCustomer(String recipientPsid, String imageUrl) {
        if (pageToken == null || pageToken.isBlank() || imageUrl == null || imageUrl.isBlank()) {
            log.warn("Thiếu pageToken hoặc imageUrl, không thể gửi ảnh");
            return false;
        }

        try {
            String url = "https://graph.facebook.com/v21.0/me/messages?access_token=" + pageToken;

            Map<String, Object> body = Map.of(
                    "recipient", Map.of("id", recipientPsid),
                    "message", Map.of(
                            "attachment", Map.of(
                                    "type", "image",
                                    "payload", Map.of(
                                            "url", imageUrl,
                                            "is_reusable", true))));

            HttpHeaders headers = new HttpHeaders();
            headers.setContentType(MediaType.APPLICATION_JSON);

            HttpEntity<Map<String, Object>> entity = new HttpEntity<>(body, headers);
            ResponseEntity<String> response = restTemplate.postForEntity(url, entity, String.class);

            if (response.getStatusCode().is2xxSuccessful()) {
                log.info("==> Gửi ảnh thành công tới PSID {}: {}", recipientPsid, imageUrl);

                String nowIso = java.time.Instant.now().toString();
                String formattedTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss dd/MM/yyyy"));

                String fbMid = null;
                try {
                    Map<String, Object> respMap = objectMapper.readValue(response.getBody(), Map.class);
                    if (respMap != null && respMap.containsKey("message_id")) {
                        fbMid = String.valueOf(respMap.get("message_id"));
                    }
                } catch (Exception ignored) {
                }
                String finalMid = (fbMid != null && !fbMid.isBlank()) ? fbMid : UUID.randomUUID().toString();

                Map<String, Object> sentRecord = new HashMap<>();
                sentRecord.put("mid", finalMid);
                sentRecord.put("senderPsid", recipientPsid);
                sentRecord.put("senderName", "THORS Studio");
                sentRecord.put("text", "[Hình ảnh mã QR VietQR]");
                sentRecord.put("imageUrl", imageUrl);
                sentRecord.put("rawTime", nowIso);
                sentRecord.put("timestamp", formattedTime);
                sentRecord.put("from", "SHOP");
                recentMessages.add(sentRecord);

                conversations.computeIfPresent(recipientPsid, (k, conv) -> {
                    conv.put("lastMessage", "Bạn đã gửi 1 hình ảnh");
                    conv.put("lastTimestamp", formattedTime);
                    return conv;
                });

                return true;
            }
        } catch (Exception e) {
            if (e instanceof org.springframework.web.client.HttpStatusCodeException se) {
                log.error("Lỗi khi gửi ảnh qua Facebook tới PSID {}: HTTP {} - {}", recipientPsid, se.getStatusCode(),
                        se.getResponseBodyAsString());
            } else {
                log.error("Lỗi khi gửi ảnh qua Facebook tới PSID " + recipientPsid, e);
            }
        }
        return false;
    }

    @PostConstruct
    public void init() {
        // Tự động đồng bộ lịch sử tin nhắn và hội thoại từ Fanpage khi khởi động
        new Thread(() -> {
            try {
                Thread.sleep(1000);
                syncConversationsFromFacebook();
            } catch (Exception ignored) {
            }
        }).start();
    }

    /**
     * Đồng bộ toàn bộ lịch sử tin nhắn & hội thoại từ Facebook Graph API
     */
    public synchronized void syncConversationsFromFacebook() {
        if (pageToken == null || pageToken.isBlank()) {
            return;
        }

        try {
            log.info("==> Đang đồng bộ toàn bộ hội thoại và tin nhắn từ Facebook Graph API...");
            String convUrl = "https://graph.facebook.com/v21.0/me/conversations?fields=id,updated_time,snippet,unread_count,participants&access_token="
                    + pageToken;
            Map<String, Object> resp = restTemplate.getForObject(convUrl, Map.class);
            if (resp == null || !resp.containsKey("data")) {
                return;
            }

            List<Map<String, Object>> convList = (List<Map<String, Object>>) resp.get("data");
            if (convList == null)
                return;

            Set<String> existingMids = recentMessages.stream()
                    .map(m -> String.valueOf(m.get("mid")))
                    .collect(Collectors.toSet());

            for (Map<String, Object> convData : convList) {
                String convId = String.valueOf(convData.get("id"));
                Map<String, Object> participantsWrapper = (Map<String, Object>) convData.get("participants");
                if (participantsWrapper == null)
                    continue;
                List<Map<String, Object>> participants = (List<Map<String, Object>>) participantsWrapper.get("data");
                if (participants == null)
                    continue;

                // Tìm khách hàng (người tham gia không phải là Page)
                Map<String, Object> customerParticipant = null;
                for (Map<String, Object> p : participants) {
                    String pId = String.valueOf(p.get("id"));
                    if (!pId.equals(pageId)) {
                        customerParticipant = p;
                        break;
                    }
                }
                if (customerParticipant == null)
                    continue;

                String customerPsid = String.valueOf(customerParticipant.get("id"));
                String customerName = customerParticipant.get("name") != null
                        ? String.valueOf(customerParticipant.get("name"))
                        : "Khách Facebook";

                // Thử lấy avatar từ profile nếu có
                Map<String, String> prof = fetchCustomerProfile(customerPsid);
                String customerAvatar = prof.getOrDefault("avatar", "");

                String snippet = convData.get("snippet") != null ? String.valueOf(convData.get("snippet")) : "";
                Integer unreadCount = convData.get("unread_count") instanceof Number
                        ? ((Number) convData.get("unread_count")).intValue()
                        : 0;
                String updatedTime = formatFacebookTime(convData.get("updated_time"));

                // Lưu cuộc trò chuyện
                final String finalCustomerName = customerName;
                final String finalCustomerAvatar = customerAvatar;
                conversations.compute(customerPsid, (k, existing) -> {
                    Map<String, Object> conv = existing != null ? existing : new HashMap<>();
                    conv.put("psid", customerPsid);
                    conv.put("name", finalCustomerName);
                    conv.put("avatar", finalCustomerAvatar);
                    conv.put("lastMessage", snippet);
                    conv.put("lastTimestamp", updatedTime);
                    conv.put("unreadCount", unreadCount);
                    return conv;
                });

                // Tải tin nhắn của cuộc trò chuyện này
                try {
                    String msgUrl = "https://graph.facebook.com/v21.0/" + convId
                            + "/messages?fields=id,created_time,from,message&limit=50&access_token=" + pageToken;
                    Map<String, Object> msgResp = restTemplate.getForObject(msgUrl, Map.class);
                    if (msgResp != null && msgResp.containsKey("data")) {
                        List<Map<String, Object>> msgList = (List<Map<String, Object>>) msgResp.get("data");
                        if (msgList != null) {
                            List<Map<String, Object>> chronologicalList = new ArrayList<>(msgList);
                            Collections.reverse(chronologicalList);

                            for (Map<String, Object> m : chronologicalList) {
                                String mid = String.valueOf(m.get("id"));
                                if (existingMids.contains(mid))
                                    continue;

                                String text = m.get("message") != null ? String.valueOf(m.get("message")) : "";
                                Map<String, Object> fromObj = (Map<String, Object>) m.get("from");
                                String fromId = fromObj != null ? String.valueOf(fromObj.get("id")) : "";
                                boolean isShop = pageId != null && pageId.equals(fromId);

                                // Bỏ qua nếu tin nhắn của Shop vừa gửi đã được ghi nhận trước đó
                                boolean duplicateShopMsg = isShop && recentMessages.stream()
                                        .anyMatch(existing -> "SHOP".equals(existing.get("from"))
                                                && customerPsid.equals(existing.get("senderPsid"))
                                                && text.equals(existing.get("text")));
                                if (duplicateShopMsg) {
                                    existingMids.add(mid);
                                    continue;
                                }

                                String rawTime = m.get("created_time") != null ? String.valueOf(m.get("created_time"))
                                        : "";

                                Map<String, Object> record = new HashMap<>();
                                record.put("mid", mid);
                                record.put("senderPsid", customerPsid);
                                record.put("senderName", isShop ? "THORS Studio" : finalCustomerName);
                                record.put("senderAvatar", isShop ? "" : finalCustomerAvatar);
                                record.put("text", text);
                                record.put("rawTime", rawTime);
                                record.put("timestamp", formatFacebookTime(rawTime));
                                record.put("from", isShop ? "SHOP" : "CUSTOMER");

                                recentMessages.add(record);
                                existingMids.add(mid);
                            }
                        }
                    }
                } catch (Exception ex) {
                    log.warn("Không lấy được tin nhắn cho hội thoại {}: {}", convId, ex.getMessage());
                }
            }

            log.info("==> Đã đồng bộ thành công {} hội thoại và {} tin nhắn từ Facebook",
                    conversations.size(), recentMessages.size());
        } catch (Exception e) {
            log.error("Lỗi khi đồng bộ hội thoại từ Facebook Graph API: {}", e.getMessage(), e);
        }
    }

    public String formatFacebookTime(Object timeObj) {
        if (timeObj == null)
            return LocalDateTime.now().format(DateTimeFormatter.ofPattern("HH:mm:ss dd/MM/yyyy"));
        try {
            String timeStr = String.valueOf(timeObj);
            OffsetDateTime odt = OffsetDateTime.parse(timeStr, DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssZ"));
            ZonedDateTime vnTime = odt.atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh"));
            return vnTime.format(DateTimeFormatter.ofPattern("HH:mm:ss dd/MM/yyyy"));
        } catch (Exception e) {
            try {
                OffsetDateTime odt = OffsetDateTime.parse(String.valueOf(timeObj),
                        DateTimeFormatter.ISO_OFFSET_DATE_TIME);
                return odt.atZoneSameInstant(ZoneId.of("Asia/Ho_Chi_Minh"))
                        .format(DateTimeFormatter.ofPattern("HH:mm:ss dd/MM/yyyy"));
            } catch (Exception ignored) {
                return String.valueOf(timeObj);
            }
        }
    }

    private volatile long lastSyncTime = 0;
    private static final long AUTO_SYNC_INTERVAL_MS = 10_000; // Tự động đồng bộ ngầm sau mỗi 10 giây

    public List<Map<String, Object>> getRecentMessages() {
        if (recentMessages.isEmpty()) {
            syncConversationsFromFacebook();
            lastSyncTime = System.currentTimeMillis();
        } else if (System.currentTimeMillis() - lastSyncTime > AUTO_SYNC_INTERVAL_MS) {
            lastSyncTime = System.currentTimeMillis();
            CompletableFuture.runAsync(this::syncConversationsFromFacebook);
        }
        return recentMessages;
    }

    public Collection<Map<String, Object>> getConversations() {
        if (conversations.isEmpty()) {
            syncConversationsFromFacebook();
            lastSyncTime = System.currentTimeMillis();
        } else if (System.currentTimeMillis() - lastSyncTime > AUTO_SYNC_INTERVAL_MS) {
            lastSyncTime = System.currentTimeMillis();
            CompletableFuture.runAsync(this::syncConversationsFromFacebook);
        }
        return conversations.values();
    }

    private synchronized void logToFile(Map<String, Object> payload) {
        try {
            File logFile = new File("facebook_webhook_events.log");
            try (PrintWriter out = new PrintWriter(new FileWriter(logFile, true))) {
                out.println("[" + LocalDateTime.now() + "] " + objectMapper.writeValueAsString(payload));
            }
        } catch (Exception ignored) {
        }
    }

    /**
     * Tạo đơn hàng từ Facebook POS và lưu trực tiếp vào Quản lý Đơn hàng (orders)
     */
    @Transactional
    public Map<String, Object> createOrderFromFacebook(Map<String, Object> req) {
        if (jdbc == null) {
            throw new ApiException(500, "DB_ERROR", "Dịch vụ cơ sở dữ liệu chưa sẵn sàng.");
        }

        Integer actorId = 1;
        if (sessionAccess != null) {
            try {
                Account actor = sessionAccess.current();
                if (actor != null) {
                    actorId = actor.id();
                }
            } catch (Exception ignored) {
            }
        }

        String customerName = req.get("customerName") != null ? String.valueOf(req.get("customerName")).trim() : "";
        String customerPhone = req.get("customerPhone") != null ? String.valueOf(req.get("customerPhone")).trim() : "";
        String customerAddress = req.get("customerAddress") != null ? String.valueOf(req.get("customerAddress")).trim()
                : "";
        String paymentMethod = req.get("paymentMethod") != null
                ? String.valueOf(req.get("paymentMethod")).trim().toUpperCase()
                : "ONLINE";
        String psid = req.get("psid") != null ? String.valueOf(req.get("psid")) : "";

        if (customerName.isBlank()) {
            customerName = "Khách Facebook"
                    + (psid.length() > 6 ? " (#" + psid.substring(psid.length() - 6) + ")" : "");
        }

        List<Map<String, Object>> items = (List<Map<String, Object>>) req.get("items");
        if (items == null || items.isEmpty()) {
            throw new ApiException(400, "EMPTY_CART", "Đơn hàng phải có ít nhất 1 sản phẩm.");
        }

        long itemsAmount = 0;
        List<Map<String, Object>> validItems = new ArrayList<>();

        for (Map<String, Object> it : items) {
            int detailId = ((Number) it.get("detailId")).intValue();
            int quantity = ((Number) it.get("quantity")).intValue();
            if (quantity <= 0)
                continue;

            List<Map<String, Object>> rows = jdbc.queryForList("""
                    SELECT pd.detail_id, pd.product_id, p.product_name, pd.size, pd.color, pd.price, pd.stock_quantity
                    FROM product_detail pd
                    JOIN product p ON p.product_id = pd.product_id
                    WHERE pd.detail_id = ?
                    """, detailId);

            if (rows.isEmpty()) {
                throw new ApiException(400, "PRODUCT_NOT_FOUND",
                        "Không tìm thấy thông tin sản phẩm (ID: " + detailId + ").");
            }

            Map<String, Object> row = rows.get(0);
            int stock = ((Number) row.get("stock_quantity")).intValue();
            String pName = String.valueOf(row.get("product_name"));
            String size = String.valueOf(row.get("size"));
            String color = String.valueOf(row.get("color"));
            long price = ((Number) row.get("price")).longValue();

            if (quantity > stock) {
                throw new ApiException(400, "OUT_OF_STOCK",
                        "Sản phẩm \"" + pName + "\" (" + size + "/" + color + ") chỉ còn " + stock + " cái trong kho.");
            }

            long lineTotal = price * quantity;
            itemsAmount += lineTotal;

            Map<String, Object> itemData = new HashMap<>(row);
            itemData.put("buyQuantity", quantity);
            itemData.put("unitPrice", price);
            validItems.add(itemData);
        }

        long totalAmount = itemsAmount;
        String dateStr = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        String orderNumber = "ORD-" + dateStr + "-FB" + suffix.substring(0, 4);

        String initialStatus = "PENDING_CONFIRMATION";

        KeyHolder keyHolder = new GeneratedKeyHolder();
        final String finalCustomerName = customerName;
        final String finalCustomerPhone = customerPhone;
        final String finalCustomerAddress = customerAddress;
        final String finalPaymentMethod = paymentMethod;
        final long finalItemsAmount = itemsAmount;
        final long finalTotalAmount = totalAmount;
        final int finalActorId = actorId;

        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement("""
                    INSERT INTO orders (
                        user_id, created_by, order_number, order_type, order_date,
                        order_status, preparation_status, payment_method, payment_status,
                        items_amount, promotion_discount_amount, coupon_discount_amount,
                        shipping_fee, total_amount,
                        delivery_name, delivery_phone, delivery_address
                    ) VALUES (
                        ?, ?, ?, 'Online', NOW(),
                        ?, 'NOT_STARTED', ?, 'UNPAID',
                        ?, 0, 0,
                        0, ?,
                        ?, ?, ?
                    )
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, finalActorId);
            ps.setInt(2, finalActorId);
            ps.setString(3, orderNumber);
            ps.setString(4, initialStatus);
            ps.setString(5, finalPaymentMethod);
            ps.setLong(6, finalItemsAmount);
            ps.setLong(7, finalTotalAmount);
            ps.setString(8, finalCustomerName);
            ps.setString(9, finalCustomerPhone);
            ps.setString(10, finalCustomerAddress.isBlank() ? "Giao hàng qua Facebook" : finalCustomerAddress);
            return ps;
        }, keyHolder);

        int orderId = keyHolder.getKey().intValue();

        for (Map<String, Object> line : validItems) {
            int detailId = ((Number) line.get("detail_id")).intValue();
            int qty = ((Number) line.get("buyQuantity")).intValue();
            long unitPrice = ((Number) line.get("unitPrice")).longValue();

            jdbc.update("""
                    INSERT INTO order_item (order_id, detail_id, product_name_snapshot, size_snapshot,
                                            color_snapshot, quantity, unit_price)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    orderId,
                    detailId,
                    line.get("product_name"),
                    line.get("size"),
                    line.get("color"),
                    qty,
                    unitPrice);

            // Trừ tồn kho thực tế ngay lập tức
            jdbc.update(
                    "UPDATE product_detail SET stock_quantity = stock_quantity - ? WHERE detail_id = ? AND stock_quantity >= ?",
                    qty, detailId, qty);
        }

        log.info("==> Đã tạo đơn hàng Facebook #{} ({}) cho khách: {} - Tổng tiền: {}",
                orderId, orderNumber, customerName, totalAmount);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderId", orderId);
        result.put("orderNumber", orderNumber);
        result.put("totalAmount", totalAmount);
        result.put("deliveryName", customerName);
        result.put("deliveryPhone", customerPhone);
        result.put("deliveryAddress", customerAddress);
        result.put("status", initialStatus);
        return result;
    }
}

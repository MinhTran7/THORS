package com.thors.module.facebook.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import jakarta.annotation.PostConstruct;
import com.thors.common.ApiException;
import com.thors.config.Settings;
import com.thors.module.account.entity.Account;
import com.thors.module.order.delivery.GeoClient;
import com.thors.module.order.service.OrderService;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import com.thors.module.promotion.service.PricingService;
import com.thors.security.SessionAccess;
import org.springframework.beans.factory.annotation.Autowired;
import com.thors.module.facebook.repository.FacebookOrderRepository;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.NumberFormat;
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
import java.util.function.BiFunction;
import java.util.stream.Collectors;

@Service
public class FacebookService {

    private static final Logger log = LoggerFactory.getLogger(FacebookService.class);

    @Value("${thors.facebook.page-token:}")
    private String pageToken;

    @Value("${thors.facebook.page-id:1375988095602878}")
    private String pageId;

    // SQL của luồng tạo đơn (ghi vào orders / order_item của module Order)
    private final FacebookOrderRepository orders;
    private final SessionAccess sessionAccess;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    // Dịch vụ bản đồ (OpenStreetMap) dùng chung với luồng xác nhận đơn online
    private final GeoClient geo;

    // Gửi thông báo đơn mới cho những người xử lý đơn khác của cửa hàng
    private final OrderService orderService;
    private final Settings settings;
    private final PricingService pricing;
    private final PromotionRepository promotionRepository;

    public FacebookService(
            FacebookOrderRepository orders,
            SessionAccess sessionAccess,
            GeoClient geo,
            OrderService orderService) {
        this(orders, sessionAccess, geo, orderService, null, null, null);
    }

    public FacebookService(
            FacebookOrderRepository orders,
            SessionAccess sessionAccess,
            GeoClient geo,
            OrderService orderService,
            Settings settings) {
        this(orders, sessionAccess, geo, orderService, settings, null, null);
    }

    @Autowired
    public FacebookService(
            @Autowired(required = false) FacebookOrderRepository orders,
            @Autowired(required = false) SessionAccess sessionAccess,
            @Autowired(required = false) GeoClient geo,
            @Autowired(required = false) OrderService orderService,
            @Autowired(required = false) Settings settings,
            @Autowired(required = false) PricingService pricing,
            @Autowired(required = false) PromotionRepository promotionRepository) {
        this.orders = orders;
        this.sessionAccess = sessionAccess;
        this.geo = geo;
        this.orderService = orderService;
        this.settings = settings;
        this.pricing = pricing;
        this.promotionRepository = promotionRepository;
    }

    // ==========================================
    // SỐ ĐIỆN THOẠI & ĐỊA CHỈ GIAO HÀNG
    // ==========================================

    /**
     * Chuẩn hóa SĐT di động Việt Nam về dạng 10 số bắt đầu bằng 0: chấp nhận "+84 566 238 971",
     * "84566238971", "0566.238.971"... Trả về null nếu không phải SĐT di động hợp lệ (đầu 03/05/07/08/09).
     */
    public static String normalizeVnPhone(String value) {
        if (value == null) return null;
        String digits = value.replaceAll("[^0-9]", "");
        if (digits.startsWith("84") && digits.length() == 11) digits = "0" + digits.substring(2);
        return digits.matches("0[35789][0-9]{8}") ? digits : null;
    }

    /**
     * Kiểm tra địa chỉ giao trên bản đồ (cùng dịch vụ mà bước Owner xác nhận đơn dùng để chặn địa chỉ không
     * có thật). Địa chỉ nên theo dạng "Số nhà/đường, Phường/Xã, Tỉnh/Thành phố" để tìm theo từng phần.
     */
    public Map<String, Object> checkAddress(String address) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (address == null || address.isBlank()) {
            throw new ApiException(400, "ADDRESS_REQUIRED", "Vui lòng nhập địa chỉ giao hàng.");
        }
        if (geo == null) {
            result.put("status", "UNAVAILABLE");
            return result;
        }
        GeoClient.Lookup lookup = geo.lookup(address.trim());
        if (lookup.place().isPresent()) {
            GeoClient.Place place = lookup.place().get();
            result.put("status", "FOUND");
            // HOUSE: khớp số nhà; STREET: khớp tên đường; AREA: chỉ khớp phường/xã
            result.put("precision", place.precision().name());
            result.put("matchedAddress", place.address());
            result.put("lat", place.lat());
            result.put("lng", place.lng());
        } else {
            result.put("status", lookup.unavailable() ? "UNAVAILABLE" : "NOT_FOUND");
        }
        return result;
    }

    // Lưu danh sách tin nhắn nhận được gần đây (in-memory)
    private final List<Map<String, Object>> recentMessages = new CopyOnWriteArrayList<>();

    /** Giữ tối đa bấy nhiêu tin nhắn gần nhất trong bộ nhớ (cũ hơn thì bỏ, lần đồng bộ sau lấy lại từ Facebook). */
    static final int MAX_RECENT_MESSAGES = 2000;

    /** Thêm tin nhắn vào bộ nhớ đệm, bỏ bớt tin cũ nhất khi vượt MAX_RECENT_MESSAGES để RAM không phình mãi. */
    private synchronized void addRecent(Map<String, Object> record) {
        recentMessages.add(record);
        int overflow = recentMessages.size() - MAX_RECENT_MESSAGES;
        if (overflow > 0) {
            recentMessages.subList(0, overflow).clear();
        }
    }

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
            // Payload có nội dung tin nhắn của khách: chỉ ghi ở mức DEBUG, không ghi ra file ở thư mục chạy
            log.debug("==> Đang xử lý sự kiện Facebook Webhook: {}", payload);

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

                    addRecent(msgRecord);

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
                sentRecord.put("senderName", "THORS");
                sentRecord.put("text", text);
                sentRecord.put("rawTime", nowIso);
                sentRecord.put("timestamp", formattedTime);
                sentRecord.put("from", "SHOP");
                addRecent(sentRecord);

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
                sentRecord.put("senderName", "THORS");
                sentRecord.put("text", "[Hình ảnh mã QR VietQR]");
                sentRecord.put("imageUrl", imageUrl);
                sentRecord.put("rawTime", nowIso);
                sentRecord.put("timestamp", formattedTime);
                sentRecord.put("from", "SHOP");
                addRecent(sentRecord);

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
                                record.put("senderName", isShop ? "THORS" : finalCustomerName);
                                record.put("senderAvatar", isShop ? "" : finalCustomerAvatar);
                                record.put("text", text);
                                record.put("rawTime", rawTime);
                                record.put("timestamp", formatFacebookTime(rawTime));
                                record.put("from", isShop ? "SHOP" : "CUSTOMER");

                                addRecent(record);
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

    // (Bỏ logToFile - ghi payload webhook ra facebook_webhook_events.log ở thư mục chạy - 26/11/2026:
    //  file chứa tin nhắn khách, phình mãi; đã có log.debug trong processWebhookPayload.)

    /**
     * Tạo đơn hàng từ Facebook POS và lưu trực tiếp vào Quản lý Đơn hàng (orders)
     */
    @Transactional
    public Map<String, Object> createOrderFromFacebook(Map<String, Object> req) {
        if (orders == null) {
            throw new ApiException(500, "DB_ERROR", "Dịch vụ cơ sở dữ liệu chưa sẵn sàng.");
        }

        // Bắt buộc có người bán đăng nhập; không tự gán user #1 khi thiếu phiên
        if (sessionAccess == null) {
            throw new ApiException(401, "UNAUTHENTICATED", "Vui lòng đăng nhập.");
        }
        Account actor = sessionAccess.current();
        if (!"OWNER".equals(actor.role()) && !"FAMILY_MEMBER".equals(actor.role())) {
            throw new ApiException(403, "FORBIDDEN", "Chỉ OWNER hoặc FAMILY_MEMBER được tạo đơn Facebook.");
        }
        int actorId = actor.id();

        String customerName = req.get("customerName") != null ? String.valueOf(req.get("customerName")).trim() : "";
        String customerPhone = req.get("customerPhone") != null ? String.valueOf(req.get("customerPhone")).trim() : "";
        String customerAddress = req.get("customerAddress") != null ? String.valueOf(req.get("customerAddress")).trim()
                : "";
        String paymentMethod = req.get("paymentMethod") != null
                ? String.valueOf(req.get("paymentMethod")).trim().toUpperCase()
                : "ONLINE";
        if (!"ONLINE".equals(paymentMethod) && !"COD".equals(paymentMethod)) {
            throw new ApiException(400, "PAYMENT_METHOD", "Hình thức thanh toán chỉ hỗ trợ ONLINE hoặc COD.");
        }
        String psid = req.get("psid") != null ? String.valueOf(req.get("psid")) : "";

        if (customerName.isBlank()) {
            customerName = "Khách Facebook"
                    + (psid.length() > 6 ? " (#" + psid.substring(psid.length() - 6) + ")" : "");
        }
        if (customerName.length() > 100) {
            throw new ApiException(400, "CUSTOMER_NAME", "Họ tên người nhận tối đa 100 ký tự.");
        }

        // SĐT lưu thống nhất dạng 0xxxxxxxxx (trang tra cứu đơn so 4 số cuối với số này)
        String normalizedPhone = normalizeVnPhone(customerPhone);
        if (normalizedPhone == null) {
            throw new ApiException(400, "CUSTOMER_PHONE",
                    "Số điện thoại không hợp lệ. Cần 10 số di động, ví dụ 0912345678 hoặc +84 912 345 678.");
        }
        customerPhone = normalizedPhone;

        if (customerAddress.isBlank()) {
            throw new ApiException(400, "CUSTOMER_ADDRESS", "Vui lòng nhập địa chỉ giao hàng.");
        }
        if (customerAddress.length() > 255) {
            throw new ApiException(400, "CUSTOMER_ADDRESS", "Địa chỉ giao hàng tối đa 255 ký tự.");
        }

        // Lưu tọa độ nếu tìm thấy trên bản đồ: bước Owner xác nhận đơn sẽ không phải tìm lại.
        // Không tìm thấy / dịch vụ bản đồ lỗi thì vẫn tạo đơn (màn hình POS đã cảnh báo trước khi chốt).
        Double deliveryLat = null;
        Double deliveryLng = null;
        if (geo != null) {
            try {
                Optional<GeoClient.Place> place = geo.geocode(customerAddress);
                if (place.isPresent()) {
                    deliveryLat = place.get().lat();
                    deliveryLng = place.get().lng();
                }
            } catch (Exception e) {
                log.warn("Không tìm được tọa độ cho địa chỉ đơn Facebook: {}", e.getMessage());
            }
        }

        Object rawItems = req.get("items");
        if (!(rawItems instanceof List<?> rawList) || rawList.isEmpty()) {
            throw new ApiException(400, "EMPTY_CART", "Đơn hàng phải có ít nhất 1 sản phẩm.");
        }

        long shippingFee = parseShippingFee(req.get("shippingFee"));
        Integer requestedPromotionId = parsePositiveInt(req.get("promotionId"), "PROMOTION_ID",
                "Mã giảm giá không hợp lệ.");

        var quoter = pricing != null ? pricing.quoter() : null;
        BiFunction<Integer, BigDecimal, BigDecimal> salePrice =
                quoter != null ? (pid, p) -> quoter.apply(pid, p).price() : (pid, p) -> p;
        long itemsAmount = 0;
        List<Map<String, Object>> validItems = new ArrayList<>();
        Map<Integer, Integer> requestedQtyByDetail = new HashMap<>();

        for (Object itemObj : rawList) {
            if (!(itemObj instanceof Map<?, ?> it)
                    || !(it.get("detailId") instanceof Number detailNum)
                    || !(it.get("quantity") instanceof Number qtyNum)) {
                throw new ApiException(400, "INVALID_ITEM", "Thông tin sản phẩm trong đơn không hợp lệ.");
            }
            int detailId = detailNum.intValue();
            int quantity = qtyNum.intValue();
            if (quantity <= 0)
                continue;

            // Khóa dòng biến thể (FOR UPDATE) để hai đơn chốt cùng lúc không giữ quá số hàng có thể bán
            Map<String, Object> row = orders.lockVariant(detailId)
                    .orElseThrow(() -> new ApiException(400, "PRODUCT_NOT_FOUND",
                            "Không tìm thấy thông tin sản phẩm (ID: " + detailId + ")."));
            int productId = ((Number) row.get("product_id")).intValue();
            int stock = ((Number) row.get("stock_quantity")).intValue();
            String pName = String.valueOf(row.get("product_name"));
            String size = String.valueOf(row.get("size"));
            String color = String.valueOf(row.get("color"));
            if (row.get("price") == null) {
                throw new ApiException(400, "NO_PRICE",
                        "Sản phẩm \"" + pName + "\" (" + size + "/" + color + ") chưa có giá bán.");
            }
            BigDecimal basePrice = row.get("price") instanceof BigDecimal bd
                    ? bd
                    : new BigDecimal(String.valueOf(row.get("price")));
            long price = salePrice.apply(productId, basePrice).longValue();

            if (!"ACTIVE".equals(row.get("variant_status")) || !"ACTIVE".equals(row.get("product_status"))) {
                throw new ApiException(400, "PRODUCT_INACTIVE",
                        "Sản phẩm \"" + pName + "\" (" + size + "/" + color + ") đang ngừng bán.");
            }

            // Có thể bán = tồn − hàng đang giữ cho các đơn khác chưa xác nhận (cùng công thức màn hình Tồn kho)
            int sellable = Math.max(0, stock - orders.heldQuantity(detailId));

            // Cùng một biến thể ở nhiều dòng: cộng dồn rồi mới so với số có thể bán
            int totalRequestedForVariant = requestedQtyByDetail.merge(detailId, quantity, Integer::sum);
            if (totalRequestedForVariant > sellable) {
                throw new ApiException(400, "OUT_OF_STOCK",
                        "Sản phẩm \"" + pName + "\" (" + size + "/" + color + ") chỉ còn " + sellable
                                + " cái có thể bán" + (sellable < stock ? " (" + (stock - sellable) + " cái đang giữ cho đơn khác)" : "") + ".");
            }

            long lineTotal = price * quantity;
            itemsAmount += lineTotal;

            Map<String, Object> itemData = new HashMap<>(row);
            itemData.put("buyQuantity", quantity);
            itemData.put("unitPrice", price);
            validItems.add(itemData);
        }

        // Mọi dòng có số lượng <= 0 (đã bỏ qua) -> không tạo đơn rỗng 0đ
        if (validItems.isEmpty()) {
            throw new ApiException(400, "EMPTY_CART", "Đơn hàng phải có ít nhất 1 sản phẩm.");
        }

        Integer promotionId = null;
        String promotionName = null;
        long promotionDiscount = 0;
        if (requestedPromotionId != null) {
            if (promotionRepository == null) {
                throw new ApiException(500, "PROMO_UNAVAILABLE", "Dịch vụ khuyến mãi chưa sẵn sàng.");
            }
            Promotion promo = promotionRepository.lockById(requestedPromotionId)
                    .orElseThrow(() -> new ApiException(400, "PROMOTION_NOT_FOUND", "Mã giảm giá không tồn tại."));
            if (!promo.isOrderVoucher()) {
                throw new ApiException(400, "PROMOTION_INVALID",
                        "Giảm giá sản phẩm được áp dụng tự động, không cần chọn mã.");
            }
            LocalDateTime now = LocalDateTime.now();
            if (!"ACTIVE".equals(promo.status()) || now.isBefore(promo.startDate()) || !now.isBefore(promo.endDate())) {
                throw new ApiException(400, "PROMOTION_UNAVAILABLE", "Mã giảm giá hiện không khả dụng.");
            }
            if (promo.usageLimit() != null && promotionRepository.countUsage(promo.promotionId()) >= promo.usageLimit()) {
                throw new ApiException(400, "PROMOTION_LIMIT", "Mã giảm giá đã hết lượt sử dụng.");
            }
            BigDecimal itemsDec = BigDecimal.valueOf(itemsAmount);
            if (itemsDec.compareTo(promo.minOrderValue()) < 0) {
                throw new ApiException(400, "PROMOTION_MIN_ORDER",
                        "Đơn hàng chưa đạt giá trị tối thiểu để áp dụng mã giảm giá.");
            }
            promotionDiscount = promo.discountOf(itemsDec).longValue();
            promotionId = promo.promotionId();
            promotionName = promo.name();
        }

        long totalAmount = Math.max(0L, itemsAmount - promotionDiscount) + shippingFee;
        String dateStr = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
        String suffix = UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase();
        String orderNumber = "ORD-" + dateStr + "-FB" + suffix.substring(0, 4);

        String initialStatus = "PENDING_CONFIRMATION";

        int orderId = orders.insertOrder(new FacebookOrderRepository.NewOrder(
                actorId, orderNumber, initialStatus, paymentMethod,
                itemsAmount, promotionId, promotionName, promotionDiscount, shippingFee, totalAmount,
                customerName, customerPhone, customerAddress, deliveryLat, deliveryLng, psid));

        for (Map<String, Object> line : validItems) {
            int detailId = ((Number) line.get("detail_id")).intValue();
            int qty = ((Number) line.get("buyQuantity")).intValue();
            long unitPrice = ((Number) line.get("unitPrice")).longValue();

            // KHÔNG trừ tồn kho khi chốt đơn: chỉ GIỮ hàng (reserved_quantity) cho đơn chờ xác nhận.
            // Owner xác nhận đơn (OrderService.changeStatus -> AWAITING_PICKUP) mới trừ kho + ghi thẻ kho
            // "Xuất bán", dùng đúng phần đã giữ này; hủy / từ chối / hết hạn thì trả lại phần giữ.
            orders.insertItem(orderId, detailId, line.get("product_name"), line.get("size"), line.get("color"),
                    qty, unitPrice);
        }

        log.info("==> Đã tạo đơn hàng Facebook #{} ({}) cho khách: {} - Tổng tiền: {}",
                orderId, orderNumber, customerName, totalAmount);

        if (orderService != null) orderService.notifyFacebookOrderCreated(actor, orderId, orderNumber);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("orderId", orderId);
        result.put("orderNumber", orderNumber);
        result.put("itemsAmount", itemsAmount);
        result.put("promotionDiscountAmount", promotionDiscount);
        if (promotionName != null) {
            result.put("promotionName", promotionName);
        }
        result.put("shippingFee", shippingFee);
        result.put("totalAmount", totalAmount);
        result.put("deliveryName", customerName);
        result.put("deliveryPhone", customerPhone);
        result.put("deliveryAddress", customerAddress);
        result.put("status", initialStatus);
        result.put("paymentMethod", paymentMethod);
        return result;
    }

    private static long parseShippingFee(Object raw) {
        if (raw == null) return 0L;
        String s = String.valueOf(raw).trim();
        if (s.isEmpty()) return 0L;
        try {
            long fee = raw instanceof Number n ? n.longValue() : Long.parseLong(s);
            if (fee < 0 || fee > 10_000_000L) {
                throw new ApiException(400, "SHIPPING_FEE", "Phí vận chuyển phải từ 0 đến 10.000.000 ₫.");
            }
            return fee;
        } catch (NumberFormatException e) {
            throw new ApiException(400, "SHIPPING_FEE", "Phí vận chuyển không hợp lệ.");
        }
    }

    private static Integer parsePositiveInt(Object raw, String code, String msg) {
        if (raw == null) return null;
        String s = String.valueOf(raw).trim();
        if (s.isEmpty()) return null;
        try {
            int val = raw instanceof Number n ? n.intValue() : Integer.parseInt(s);
            if (val <= 0) throw new ApiException(400, code, msg);
            return val;
        } catch (NumberFormatException e) {
            throw new ApiException(400, code, msg);
        }
    }

    /** Tự động nhắn tin Messenger cho khách khi trạng thái đơn Facebook thay đổi (chạy sau commit, best-effort). */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT, fallbackExecution = true)
    public void onFacebookOrderStatusChanged(OrderService.FacebookOrderStatusEvent event) {
        if (event == null || event.psid() == null || event.psid().isBlank()) return;
        CompletableFuture.runAsync(() -> {
            try {
                String message = buildOrderStatusMessage(event);
                if (message == null) return;
                Map<String, Object> res = sendMessageToCustomerWithDetails(event.psid(), message);
                if (!Boolean.TRUE.equals(res.get("success"))) {
                    log.warn("Không gửi được tin nhắn trạng thái {} cho đơn {} (PSID={}): {}",
                            event.targetStatus(), event.orderNumber(), event.psid(), res.get("error"));
                }
            } catch (Exception ex) {
                log.warn("Lỗi gửi tin nhắn Messenger cho đơn {}: {}", event.orderNumber(), ex.getMessage());
            }
        });
    }

    String buildOrderStatusMessage(OrderService.FacebookOrderStatusEvent e) {
        String base = settings != null && settings.frontendUrl() != null && !settings.frontendUrl().isBlank()
                ? settings.frontendUrl().replaceAll("/+$", "")
                : "http://localhost:3000";
        String trackingUrl = base + "/tracking/" + URLEncoder.encode(e.orderNumber(), StandardCharsets.UTF_8);
        String moneyText = NumberFormat.getInstance(Locale.forLanguageTag("vi-VN")).format(e.totalAmount()) + " ₫";

        return switch (e.targetStatus()) {
            case "AWAITING_PICKUP" ->
                "✅ Đơn hàng " + e.orderNumber()
                        + " đã được shop xác nhận và đang chuẩn bị hàng để giao đến bạn.\n"
                        + "🔍 Theo dõi đơn tại: " + trackingUrl;
            case "REJECTED" -> {
                String reasonLine = (e.reason() != null && !e.reason().isBlank())
                        ? "Lý do: " + e.reason() + "\n"
                        : "";
                String refundLine;
                if (e.refundPending()) {
                    refundLine = e.refundAccountKnown()
                            ? "💰 Cửa hàng sẽ hoàn lại " + moneyText + " vào tài khoản ngân hàng của bạn trong thời gian sớm nhất.\n"
                            : "💰 Đơn đã thanh toán " + moneyText
                                    + ". Bạn vui lòng nhắn giúp shop Thông tin tài khoản ngân hàng (Tên ngân hàng + Số tài khoản + Tên chủ TK) ngay tại đây để shop chuyển khoản hoàn tiền nhé!\n";
                } else {
                    refundLine = "Xin lỗi bạn vì sự bất tiện này. Nếu cần đổi sang mẫu khác, bạn nhắn shop hỗ trợ nhé!\n";
                }
                yield "❌ Đơn hàng " + e.orderNumber() + " đã bị từ chối.\n"
                        + reasonLine + refundLine
                        + "🔍 Chi tiết đơn: " + trackingUrl;
            }
            case "SHIPPING" -> {
                String via = "GHN".equals(e.carrier())
                        ? "đã được bàn giao cho Giao Hàng Nhanh (GHN)"
                        : "đang trên đường giao đến bạn";
                yield "🚚 Đơn hàng " + e.orderNumber() + " " + via + ".\n"
                        + "🔍 Theo dõi hành trình tại: " + trackingUrl;
            }
            case "DELIVERED" ->
                "📦 Đơn hàng " + e.orderNumber()
                        + " đã giao thành công! Cảm ơn bạn đã mua sắm tại THORS ❤️\n"
                        + "🔍 Xem chi tiết đơn tại: " + trackingUrl;
            case "REFUNDED" ->
                "💸 Shop đã chuyển khoản hoàn " + moneyText + " cho đơn hàng " + e.orderNumber()
                        + " rồi nhé! Bạn kiểm tra tài khoản giúp shop ạ.\n"
                        + "🔍 Chi tiết đơn: " + trackingUrl;
            default -> null;
        };
    }
}
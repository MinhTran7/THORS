package com.thors.module.order.delivery;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.common.ApiException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * Gọi API Giao Hàng Nhanh (GHN): danh mục địa chỉ theo địa giới mới 2 cấp (34 tỉnh, không còn Quận/Huyện),
 * tạo, theo dõi và hủy vận đơn.
 *
 * <p>Cấu hình qua biến môi trường GHN_TOKEN, GHN_SHOP_ID, GHN_BASE_URL (mặc định là môi trường thử
 * nghiệm dev-online-gateway). Tài liệu: https://api.ghn.vn/home/docs/detail
 */
@Component
public class GhnClient {
    private static final Logger log = LoggerFactory.getLogger(GhnClient.class);

    /** Một dòng hàng gửi kèm vận đơn. */
    public record Item(String name, String code, int quantity, long price, int weightG) {}

    /**
     * Dữ liệu tạo vận đơn. Địa chỉ nhận theo địa giới mới 2 cấp: tên Tỉnh và tên Phường/Xã đúng như danh mục
     * mới của GHN trả về (không có Quận/Huyện).
     */
    public record CreateRequest(
            String clientOrderCode,
            String toName,
            String toPhone,
            String toAddress,
            String toProvinceName,
            String toWardName,
            long codAmount,
            int weightG,
            String note,
            List<Item> items) {}

    /** Kết quả tạo vận đơn: mã vận đơn GHN và tổng phí GHN thu của shop. */
    public record Created(String orderCode, long totalFee, String expectedDeliveryTime) {}

    /** Một mục trong danh mục địa chỉ mới (tỉnh hoặc phường/xã); aliases là các tên gọi khác. */
    public record Area(String id, String name, @JsonIgnore List<String> aliases) {
        boolean matches(String text) {
            String t = norm(text);
            if (t.isEmpty()) return false;
            if (sameName(name, t)) return true;
            return aliases.stream().anyMatch(a -> sameName(a, t));
        }
    }

    /** Gợi ý Tỉnh / Phường-Xã theo danh mục mới của GHN cho một địa chỉ dạng chữ; các trường có thể null. */
    public record Suggestion(String provinceId, String wardId) {}

    /** Chữ thường, bỏ dấu, gộp khoảng trắng: "Thành phố  Hồ Chí Minh" -> "thanh pho ho chi minh". */
    static String norm(String s) {
        String noMarks =
                java.text.Normalizer.normalize(s == null ? "" : s, java.text.Normalizer.Form.NFD)
                        .replaceAll("\\p{M}", "")
                        .replace('đ', 'd')
                        .replace('Đ', 'D');
        return noMarks.toLowerCase(java.util.Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    /** Tiền tố loại đơn vị hành chính, bỏ đi khi so tên ("Thành phố Hồ Chí Minh" = "Hồ Chí Minh"). */
    private static final java.util.regex.Pattern ADMIN_PREFIX =
            java.util.regex.Pattern.compile("^(thanh pho|tp|tinh|phuong|xa|dac khu|thi tran) ");

    /** Hai tên (đã norm phần text) có cùng chỉ một đơn vị không: bằng nhau, hoặc bằng nhau sau khi bỏ tiền tố. */
    static boolean sameName(String name, String normalizedText) {
        String n = norm(name);
        if (n.equals(normalizedText)) return true;
        String a = ADMIN_PREFIX.matcher(n).replaceFirst("");
        String b = ADMIN_PREFIX.matcher(normalizedText).replaceFirst("");
        // Chỉ bỏ tiền tố khi phần còn lại không phải toàn số ("Phường 1" khác "Xã 1")
        return !a.isEmpty() && !a.matches("\\d+") && a.equals(b);
    }

    private final RestTemplate http;
    private final ObjectMapper json = new ObjectMapper();
    private final String baseUrl;
    private final String token;
    private final String shopId;
    private final int serviceTypeId;
    private final String requiredNote;
    private final int lengthCm;
    private final int widthCm;
    private final int heightCm;

    /** Danh mục địa chỉ ít khi đổi, giữ trong bộ nhớ để không gọi GHN mỗi lần khách mở form. */
    private final Map<String, List<Area>> areaCache = new ConcurrentHashMap<>();

    public GhnClient(
            RestTemplateBuilder builder,
            @Value("${thors.ghn.base-url:https://dev-online-gateway.ghn.vn/shiip/public-api}") String baseUrl,
            @Value("${thors.ghn.token:}") String token,
            @Value("${thors.ghn.shop-id:}") String shopId,
            @Value("${thors.ghn.service-type-id:2}") int serviceTypeId,
            @Value("${thors.ghn.required-note:CHOXEMHANGKHONGTHU}") String requiredNote,
            @Value("${thors.ghn.default-length-cm:20}") int lengthCm,
            @Value("${thors.ghn.default-width-cm:15}") int widthCm,
            @Value("${thors.ghn.default-height-cm:10}") int heightCm) {
        this.http =
                builder.setConnectTimeout(Duration.ofSeconds(5)).setReadTimeout(Duration.ofSeconds(15)).build();
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.token = token == null ? "" : token.trim();
        this.shopId = shopId == null ? "" : shopId.trim();
        this.serviceTypeId = serviceTypeId;
        this.requiredNote = requiredNote;
        this.lengthCm = lengthCm;
        this.widthCm = widthCm;
        this.heightCm = heightCm;
        if (!isConfigured()) log.info("Chưa cấu hình GHN_TOKEN / GHN_SHOP_ID: chưa gửi được vận đơn GHN");
    }

    public boolean isConfigured() {
        return !token.isEmpty() && !shopId.isEmpty();
    }

    public int serviceTypeId() {
        return serviceTypeId;
    }

    // ------------------------------------------------------------------ Danh mục địa chỉ (địa giới mới 2 cấp)

    /** Số mục tối đa GHN trả về mỗi lần gọi danh mục mới. */
    private static final int PAGE = 200;

    /** 34 tỉnh/thành theo địa giới mới (GHN: GET /v3/master-data/province/all). */
    public List<Area> provinces() {
        return areaCache.computeIfAbsent(
                "p",
                k ->
                        allPages("/v3/master-data/province/all?").stream()
                                .filter(p -> !isTestProvince(p.name()))
                                .toList());
    }

    /** Phường/Xã/Đặc khu của một tỉnh theo địa giới mới (GHN: GET /v3/master-data/ward/all-by-province-id). */
    public List<Area> wards(int provinceId) {
        return areaCache.computeIfAbsent(
                "w" + provinceId,
                k -> allPages("/v3/master-data/ward/all-by-province-id?province_id=" + provinceId + "&"));
    }

    /** Gọi danh mục mới theo từng trang (tối đa 200 mục/trang) cho tới khi hết. */
    private List<Area> allPages(String pathWithQuery) {
        List<Area> out = new ArrayList<>();
        for (int offset = 0; ; offset += PAGE) {
            JsonNode data = call(HttpMethod.GET, pathWithQuery + "offset=" + offset + "&limit=" + PAGE, null, true);
            int size = data != null && data.isArray() ? data.size() : 0;
            out.addAll(areas(data));
            if (size < PAGE) return out;
        }
    }

    /**
     * Tỉnh giả của môi trường thử nghiệm GHN: có chữ "test", hoặc tên kết thúc bằng số ("Hà Nội 02").
     * Tên tỉnh thật không bao giờ kết thúc bằng số; quận/phường thì có ("Quận 1") nên không áp dụng cho chúng.
     */
    static boolean isTestProvince(String name) {
        String n = name == null ? "" : name.trim();
        return n.toLowerCase(java.util.Locale.ROOT).contains("test") || n.matches(".*\\d$");
    }

    /** Đọc danh mục mới: {_id, name, extension_names, status}; chỉ lấy mục đang hoạt động (status = 1). */
    static List<Area> areas(JsonNode data) {
        List<Area> out = new ArrayList<>();
        if (data == null || !data.isArray()) return out;
        for (JsonNode n : data) {
            if (n.path("status").asInt(1) != 1) continue;
            String name = n.path("name").asText("");
            // Môi trường thử nghiệm GHN còn mục giả vẫn đang hoạt động ("Test - Alert - Tỉnh - 001"...)
            if (name.isBlank() || name.toLowerCase(java.util.Locale.ROOT).contains("test")) continue;
            List<String> aliases = new ArrayList<>();
            for (JsonNode a : n.path("extension_names")) aliases.add(a.asText());
            out.add(new Area(n.path("_id").asText(), name, aliases));
        }
        return out;
    }

    /**
     * Đoán Tỉnh / Phường-Xã theo danh mục mới của GHN từ địa chỉ dạng "chi tiết, Phường/Xã, Tỉnh" (cách
     * checkout ghép địa chỉ, cùng địa giới 2 cấp). Chỉ là gợi ý: Owner vẫn kiểm tra trước khi gửi.
     */
    public Suggestion suggest(String address) {
        if (address == null || address.isBlank()) return new Suggestion(null, null);
        List<String> parts =
                java.util.Arrays.stream(address.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();

        Area province = null;
        int provinceIndex = -1;
        for (int i = parts.size() - 1; i >= 0 && province == null; i--) {
            String part = parts.get(i);
            province = provinces().stream().filter(p -> p.matches(part)).findFirst().orElse(null);
            if (province != null) provinceIndex = i;
        }
        if (province == null) return new Suggestion(null, null);

        // Phường/Xã thường đứng ngay trước tên tỉnh: thử từ phần gần tỉnh nhất
        List<Area> wards = wards(Integer.parseInt(province.id()));
        for (int i = provinceIndex - 1; i >= 0; i--) {
            String part = parts.get(i);
            Area ward = wards.stream().filter(w -> w.matches(part)).findFirst().orElse(null);
            if (ward != null) return new Suggestion(province.id(), ward.id());
        }
        return new Suggestion(province.id(), null);
    }

    // ------------------------------------------------------------------ Tạo và hủy vận đơn

    /** Tạo vận đơn với địa chỉ nhận theo địa giới mới (is_new_to_address = true, không có Quận/Huyện). */
    public Created create(CreateRequest r) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("payment_type_id", 1); // shop trả phí GHN; phí khách trả đã nằm trong tổng tiền đơn
        body.put("required_note", requiredNote);
        body.put("client_order_code", r.clientOrderCode());
        body.put("note", r.note() == null ? "" : r.note());
        body.put("to_name", r.toName());
        body.put("to_phone", r.toPhone());
        body.put("to_address", r.toAddress());
        body.put("is_new_to_address", true);
        body.put("to_province_name", r.toProvinceName());
        body.put("to_ward_name", r.toWardName());
        body.put("cod_amount", r.codAmount());
        body.put("weight", r.weightG());
        body.put("length", lengthCm);
        body.put("width", widthCm);
        body.put("height", heightCm);
        body.put("service_type_id", serviceTypeId);
        List<Map<String, Object>> items = new ArrayList<>();
        for (Item it : r.items()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("name", it.name());
            m.put("code", it.code());
            m.put("quantity", it.quantity());
            m.put("price", it.price());
            m.put("weight", it.weightG());
            items.add(m);
        }
        body.put("items", items);

        JsonNode data = call(HttpMethod.POST, "/v2/shipping-order/create", body, true);
        String code = data.path("order_code").asText("");
        if (code.isBlank()) throw new ApiException(502, "GHN", "GHN không trả về mã vận đơn.");
        return new Created(code, data.path("total_fee").asLong(), data.path("expected_delivery_time").asText(null));
    }

    /** Trạng thái hiện tại của vận đơn trên GHN, thời điểm cập nhật (chuỗi ISO) và lý do (có thể null). */
    public record Tracking(String status, String updatedAt, String reason) {}

    public Tracking detail(String orderCode) {
        JsonNode data = call(HttpMethod.POST, "/v2/shipping-order/detail", Map.of("order_code", orderCode), true);
        String status = data.path("status").asText("");
        // Lý do nằm trong lịch sử trạng thái (log): lấy dòng mới nhất cùng trạng thái hiện tại
        String reason = null;
        JsonNode logs = data.path("log");
        if (logs.isObject()) logs = json.createArrayNode().add(logs);
        for (JsonNode entry : logs)
            if (status.equals(entry.path("status").asText()) && !entry.path("reason").asText("").isBlank())
                reason = entry.path("reason").asText();
        return new Tracking(status, data.path("updated_date").asText(null), reason);
    }

    /** Hủy vận đơn (chỉ được khi GHN chưa lấy hàng). */
    public void cancel(String orderCode) {
        call(HttpMethod.POST, "/v2/switch-status/cancel", Map.of("order_codes", List.of(orderCode)), true);
    }

    // ------------------------------------------------------------------ Gọi HTTP

    /** Gọi GHN và trả về trường data; lỗi thì ném ApiException kèm thông báo của GHN. */
    private JsonNode call(HttpMethod method, String path, Object body, boolean withShop) {
        if (token.isEmpty())
            throw new ApiException(503, "GHN_NOT_CONFIGURED", "Chưa cấu hình GHN (thiếu GHN_TOKEN).");
        if (withShop && shopId.isEmpty())
            throw new ApiException(503, "GHN_NOT_CONFIGURED", "Chưa cấu hình GHN (thiếu GHN_SHOP_ID).");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Token", token);
        if (withShop) headers.set("ShopId", shopId);

        String raw;
        try {
            raw = http.exchange(baseUrl + path, method, new HttpEntity<>(body, headers), String.class).getBody();
        } catch (HttpStatusCodeException e) {
            raw = e.getResponseBodyAsString();
            if (raw == null || raw.isBlank()) {
                log.warn("GHN {} lỗi HTTP {}", path, e.getStatusCode().value());
                throw new ApiException(502, "GHN", "GHN trả lỗi HTTP " + e.getStatusCode().value() + ".");
            }
        } catch (RestClientException e) {
            log.warn("Không kết nối được GHN {}: {}", path, e.getClass().getSimpleName());
            throw new ApiException(502, "GHN_UNREACHABLE", "Không kết nối được GHN, vui lòng thử lại.");
        }

        JsonNode root;
        try {
            root = json.readTree(raw == null ? "" : raw);
        } catch (Exception e) {
            throw new ApiException(502, "GHN", "GHN trả dữ liệu không đọc được.");
        }
        if (root.path("code").asInt() != 200) {
            String msg = root.path("code_message_value").asText("");
            if (msg.isBlank()) msg = root.path("message").asText("Lỗi không rõ");
            log.warn("GHN {} lỗi: {} ({})", path, root.path("message").asText(""), root.path("code_message").asText(""));
            throw new ApiException(502, "GHN", "GHN: " + msg);
        }
        return root.path("data");
    }
}

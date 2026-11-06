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
 * Gọi API Giao Hàng Nhanh (GHN): danh mục địa chỉ, tính phí, tạo và hủy vận đơn.
 *
 * <p>Cấu hình qua biến môi trường GHN_TOKEN, GHN_SHOP_ID, GHN_BASE_URL (mặc định là môi trường thử
 * nghiệm dev-online-gateway). Tài liệu: https://api.ghn.vn/home/docs/detail
 */
@Component
public class GhnClient {
    private static final Logger log = LoggerFactory.getLogger(GhnClient.class);

    /** Một dòng hàng gửi kèm vận đơn. */
    public record Item(String name, String code, int quantity, long price, int weightG) {}

    /** Dữ liệu tạo vận đơn. */
    public record CreateRequest(
            String clientOrderCode,
            String toName,
            String toPhone,
            String toAddress,
            int toDistrictId,
            String toWardCode,
            long codAmount,
            int weightG,
            String note,
            List<Item> items) {}

    /** Kết quả tạo vận đơn: mã vận đơn GHN và tổng phí GHN thu của shop. */
    public record Created(String orderCode, long totalFee, String expectedDeliveryTime) {}

    /** Một mục trong danh mục địa chỉ (tỉnh, quận/huyện hoặc phường/xã); aliases là các tên gọi khác. */
    public record Area(String id, String name, @JsonIgnore List<String> aliases) {
        boolean matches(String text) {
            String t = norm(text);
            if (t.isEmpty()) return false;
            if (norm(name).equals(t)) return true;
            return aliases.stream().anyMatch(a -> norm(a).equals(t));
        }
    }

    /** Gợi ý Tỉnh / Quận-Huyện / Phường-Xã theo GHN cho một địa chỉ dạng chữ; các trường có thể null. */
    public record Suggestion(String provinceId, String districtId, String wardCode, List<Candidate> candidates) {}

    /** Một cặp Quận-Huyện + Phường-Xã khớp tên. */
    public record Candidate(String districtId, String districtName, String wardCode, String wardName) {}

    private static String norm(String s) {
        return s == null ? "" : s.trim().replaceAll("\\s+", " ").toLowerCase(java.util.Locale.ROOT);
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

    // ------------------------------------------------------------------ Danh mục địa chỉ

    public List<Area> provinces() {
        return areaCache.computeIfAbsent(
                "p",
                k -> areas(call(HttpMethod.GET, "/master-data/province", null, false), "ProvinceID", "ProvinceName"));
    }

    public List<Area> districts(int provinceId) {
        return areaCache.computeIfAbsent(
                "d" + provinceId,
                k ->
                        areas(
                                call(HttpMethod.POST, "/master-data/district", Map.of("province_id", provinceId), false),
                                "DistrictID",
                                "DistrictName"));
    }

    public List<Area> wards(int districtId) {
        return areaCache.computeIfAbsent(
                "w" + districtId,
                k ->
                        areas(
                                call(HttpMethod.POST, "/master-data/ward", Map.of("district_id", districtId), false),
                                "WardCode",
                                "WardName"));
    }

    private static List<Area> areas(JsonNode data, String idField, String nameField) {
        List<Area> out = new ArrayList<>();
        if (data == null || !data.isArray()) return out;
        for (JsonNode n : data) {
            // GHN để lại một số mục thử nghiệm / ngừng hoạt động (Status = 2), bỏ qua
            if (n.path("Status").asInt(1) != 1) continue;
            List<String> aliases = new ArrayList<>();
            for (JsonNode a : n.path("NameExtension")) aliases.add(a.asText());
            out.add(new Area(n.path(idField).asText(), n.path(nameField).asText(), aliases));
        }
        return out;
    }

    /**
     * Đoán Tỉnh / Quận-Huyện / Phường-Xã theo GHN từ địa chỉ dạng "chi tiết, Phường/Xã, Tỉnh" (cách
     * checkout ghép địa chỉ). Địa chỉ mới sau sáp nhập chỉ có 2 cấp, nên tìm phường/xã cùng tên trong mọi
     * quận/huyện của tỉnh. Chỉ là gợi ý: Owner vẫn phải kiểm tra trước khi gửi.
     */
    public Suggestion suggest(String address) {
        if (address == null || address.isBlank()) return new Suggestion(null, null, null, List.of());
        List<String> parts =
                java.util.Arrays.stream(address.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
        if (parts.isEmpty()) return new Suggestion(null, null, null, List.of());

        Area province = null;
        int provinceIndex = -1;
        for (int i = parts.size() - 1; i >= 0 && province == null; i--) {
            String part = parts.get(i);
            province = provinces().stream().filter(p -> p.matches(part)).findFirst().orElse(null);
            if (province != null) provinceIndex = i;
        }
        if (province == null) return new Suggestion(null, null, null, List.of());

        // Các phần đứng trước tên tỉnh, gần tỉnh nhất trước (thường là phường/xã)
        List<String> before = new ArrayList<>(parts.subList(0, provinceIndex));
        java.util.Collections.reverse(before);
        int provinceId = Integer.parseInt(province.id());
        List<Candidate> found = new ArrayList<>();
        for (String part : before) {
            for (Area d : districts(provinceId)) {
                for (Area w : wards(Integer.parseInt(d.id())))
                    if (w.matches(part)) found.add(new Candidate(d.id(), d.name(), w.id(), w.name()));
            }
            if (!found.isEmpty()) break;
        }
        // Trùng tên ở nhiều quận/huyện: nếu địa chỉ có ghi tên quận/huyện cũ thì chỉ giữ quận/huyện đó
        if (found.size() > 1) {
            List<Candidate> narrowed =
                    found.stream()
                            .filter(c -> districts(provinceId).stream()
                                    .filter(d -> d.id().equals(c.districtId()))
                                    .anyMatch(d -> before.stream().anyMatch(d::matches)))
                            .toList();
            if (!narrowed.isEmpty()) found = narrowed;
        }
        Candidate only = found.size() == 1 ? found.get(0) : null;
        return new Suggestion(
                province.id(), only == null ? null : only.districtId(), only == null ? null : only.wardCode(), found);
    }

    // ------------------------------------------------------------------ Phí, tạo và hủy vận đơn

    /** Phí GHN dự kiến (VNĐ) cho một kiện hàng tới quận/phường đã chọn. */
    public long fee(int toDistrictId, String toWardCode, int weightG, long codAmount) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service_type_id", serviceTypeId);
        body.put("to_district_id", toDistrictId);
        body.put("to_ward_code", toWardCode);
        body.put("weight", weightG);
        body.put("length", lengthCm);
        body.put("width", widthCm);
        body.put("height", heightCm);
        body.put("cod_value", codAmount);
        return call(HttpMethod.POST, "/v2/shipping-order/fee", body, true).path("total").asLong();
    }

    public Created create(CreateRequest r) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("payment_type_id", 1); // shop trả phí GHN; phí khách trả đã nằm trong tổng tiền đơn
        body.put("required_note", requiredNote);
        body.put("client_order_code", r.clientOrderCode());
        body.put("note", r.note() == null ? "" : r.note());
        body.put("to_name", r.toName());
        body.put("to_phone", r.toPhone());
        body.put("to_address", r.toAddress());
        body.put("to_district_id", r.toDistrictId());
        body.put("to_ward_code", r.toWardCode());
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

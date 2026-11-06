package com.thors.module.order.delivery;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.text.Normalizer;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Đổi địa chỉ thành tọa độ, tọa độ thành địa chỉ, và tính quãng đường giao hàng.
 *
 * <ul>
 *   <li>Có Goong REST key: dùng Goong (dữ liệu địa chỉ Việt Nam tốt nhất).
 *   <li>Chưa có key: dùng OpenStreetMap miễn phí (Nominatim tìm địa chỉ, OSRM tính đường). Chỉ để test
 *       khi phát triển: Nominatim giới hạn 1 lượt/giây, server OSRM công khai chỉ dành cho demo.
 *   <li>Goong lỗi (key chưa kích hoạt, hết hạn mức, mất mạng...) hoặc không ra kết quả: tự chuyển sang
 *       OpenStreetMap.
 *   <li>Mọi cách đều lỗi: quãng đường ước tính theo đường thẳng × 1,3.
 * </ul>
 */
@Component
public class GeoClient {
    private static final Logger log = LoggerFactory.getLogger(GeoClient.class);
    private static final String GOONG = "https://rsapi.goong.io";
    private static final String NOMINATIM = "https://nominatim.openstreetmap.org";
    private static final String OSRM = "https://router.project-osrm.org";

    /** Đường bộ thường dài hơn đường thẳng khoảng 30%, dùng khi không lấy được quãng đường thật. */
    private static final double ROAD_FACTOR = 1.3;

    public record LatLng(double lat, double lng) {}

    /**
     * Mức chính xác của kết quả tìm địa chỉ.
     *
     * <ul>
     *   <li>HOUSE: khớp tới số nhà (hoặc tòa nhà / địa điểm có số nhà đó), tọa độ chính xác.
     *   <li>STREET: khớp tên đường nhưng bản đồ không có số nhà; tọa độ là điểm giữa con đường, có thể
     *       lệch vài trăm mét với đường dài.
     *   <li>AREA: chỉ khớp tới phường/xã (không tìm thấy tên đường), tọa độ chỉ gần đúng.
     * </ul>
     *
     * Kết quả chỉ khớp tới tỉnh/thành phố bị bỏ hẳn: lấy tâm thành phố để tính quãng đường thì sai hoàn toàn.
     */
    public enum Precision {
        HOUSE,
        STREET,
        AREA
    }

    /** Một kết quả tìm địa chỉ: địa chỉ đầy đủ, tọa độ và mức chính xác. */
    public record Place(String address, double lat, double lng, Precision precision) {}

    /** Nominatim: place_rank >= 26 là đường/số nhà, >= 16 là phường/xã; nhỏ hơn là quận/tỉnh/quốc gia. */
    private static final int OSM_STREET_RANK = 26;
    private static final int OSM_AREA_RANK = 16;
    /** Địa điểm cụ thể (tòa nhà, trường học, cửa hàng...) có place_rank 30. */
    private static final int OSM_HOUSE_RANK = 30;
    /** Phường/Xã sau sáp nhập 2025 có place_rank 12 trên OSM; tỉnh/thành phố là 8. */
    private static final int OSM_WARD_MIN_RANK = 10;

    /**
     * Các từ chung chung trong địa chỉ (giữ dấu), không bắt buộc phải có trong kết quả. Giữ dấu để không
     * nhầm tên riêng với từ chung: "Lỗ" là tên riêng, "Lô" mới là từ chung.
     */
    private static final Set<String> GENERIC_WORDS =
            Set.of(
                    "số", "đường", "đ", "phố", "ngõ", "ngách", "hẻm", "kiệt", "tổ", "thôn", "xóm", "ấp", "khu",
                    "phường", "p", "xã", "thị", "trấn", "quận", "q", "huyện", "h", "thành", "tp", "tỉnh", "nhà",
                    "tầng", "căn", "hộ", "tòa", "toà", "lô", "việt", "nam", "vn", "hcm", "tphcm", "hn");

    /** Như GENERIC_WORDS nhưng đã bỏ dấu, dùng khi khách gõ không dấu. */
    private static final Set<String> GENERIC_WORDS_PLAIN =
            GENERIC_WORDS.stream().map(GeoClient::normalize).collect(java.util.stream.Collectors.toSet());

    /** Quãng đường tính bằng mét; approximate = true nghĩa là ước tính theo đường thẳng. */
    public record Route(int meters, boolean approximate) {}

    private final RestTemplate http;
    private final String apiKey;
    private long lastNominatimCall = 0;

    public GeoClient(RestTemplateBuilder builder, @Value("${thors.shipping.goong-api-key:}") String apiKey) {
        this.http =
                builder.setConnectTimeout(Duration.ofSeconds(3))
                        .setReadTimeout(Duration.ofSeconds(6))
                        // Nominatim yêu cầu User-Agent nhận diện được ứng dụng
                        .defaultHeader("User-Agent", "thors-backend/1.0 (dev test)")
                        .build();
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        if (this.apiKey.isEmpty())
            log.info("Chưa có Goong API key: dùng OpenStreetMap (chỉ phù hợp để test)");
    }

    private boolean useGoong() {
        return !apiKey.isEmpty();
    }

    // ------------------------------------------------------------------ Địa chỉ -> tọa độ

    /**
     * Đổi địa chỉ dạng chữ thành tọa độ kèm mức chính xác. Trả về empty nếu không tìm được, hoặc chỉ khớp
     * tới tỉnh/thành phố (ví dụ địa chỉ không có thật).
     */
    public Optional<Place> geocode(String address) {
        return lookup(address).place();
    }

    /**
     * Kết quả tìm một địa chỉ. unavailable = true: không gọi được dịch vụ bản đồ (mất mạng, hết hạn mức...),
     * nên chưa biết địa chỉ có thật hay không; khác với "đã tìm mà không thấy".
     */
    public record Lookup(Optional<Place> place, boolean unavailable) {
        public boolean notFound() {
            return place.isEmpty() && !unavailable;
        }
    }

    /** Đổi địa chỉ dạng chữ thành tọa độ, phân biệt "không tìm thấy" với "dịch vụ bản đồ lỗi". */
    public Lookup lookup(String address) {
        if (address == null || address.isBlank()) return new Lookup(Optional.empty(), false);
        // Địa chỉ từ trang thanh toán có dạng "chi tiết, Phường/Xã, Tỉnh": tìm theo từng phần
        Optional<Parts> parts = Parts.parse(address);
        if (parts.isPresent()) return structuredLookup(parts.get());
        // Địa chỉ không theo định dạng trên (đơn mẫu, dữ liệu cũ): tìm theo cả chuỗi như trước
        if (useGoong()) {
            List<Place> found = goongSearch(address, 1);
            if (found != null && !found.isEmpty()) return new Lookup(Optional.of(found.get(0)), false);
            log.info("Goong không trả kết quả tìm địa chỉ, chuyển sang OpenStreetMap");
        }
        List<Place> found = osmSearchLoose(address, 1);
        if (found == null) return new Lookup(Optional.empty(), true);
        return new Lookup(found.stream().findFirst(), false);
    }

    /** Tìm địa chỉ theo chữ khách gõ, trả về tối đa {@code limit} kết quả (lỗi dịch vụ coi như không có). */
    public List<Place> search(String address, int limit) {
        if (address == null || address.isBlank()) return List.of();
        if (useGoong()) {
            List<Place> found = goongSearch(address, limit);
            if (found != null && !found.isEmpty()) return found;
            log.info("Goong không trả kết quả tìm địa chỉ, chuyển sang OpenStreetMap");
        }
        List<Place> found = osmSearchLoose(address, limit);
        return found == null ? List.of() : found;
    }

    // ------------------------------------------------------------------ Tìm theo từng phần địa chỉ

    /**
     * Địa chỉ theo định dạng trang thanh toán ghép ra: "chi tiết, Phường/Xã, Tỉnh/Thành phố". Phường/Xã và
     * Tỉnh do khách chọn từ danh sách nên là tên chuẩn; phần chi tiết (số nhà, tên đường) có thể chứa dấu phẩy.
     */
    record Parts(String detail, String ward, String province) {
        /** Tách từ phải sang trái; ít hơn 3 phần thì không theo định dạng trên. */
        static Optional<Parts> parse(String address) {
            List<String> p = Arrays.stream(address.split(",")).map(String::trim).filter(s -> !s.isEmpty()).toList();
            if (p.size() < 3) return Optional.empty();
            int n = p.size();
            return Optional.of(new Parts(String.join(", ", p.subList(0, n - 2)), p.get(n - 2), p.get(n - 1)));
        }

        String full() {
            return detail + ", " + ward + ", " + province;
        }

        String area() {
            return ward + ", " + province;
        }
    }

    /** Một kết quả thô từ dịch vụ bản đồ; rank = place_rank của Nominatim, -1 nếu là Goong. */
    private record Hit(String name, double lat, double lng, int rank) {}

    /**
     * Tìm theo từng phần: kết quả phải nằm đúng Phường/Xã và Tỉnh khách đã chọn. Khớp thêm tên đường thì
     * là STREET, không thì AREA. Không có kết quả nào trong đúng Phường/Xã + Tỉnh đó: không tìm thấy.
     */
    private Lookup structuredLookup(Parts p) {
        if (useGoong()) {
            List<Hit> hits = goongHits(p.full(), 5);
            Place best = hits == null ? null : pick(p, hits, true);
            if (best != null) return found(best);
            log.info("Goong không tìm được địa chỉ trong đúng phường/xã, chuyển sang OpenStreetMap");
        }

        Place best = null;
        boolean error = false;

        // 1. Có số nhà: tìm có cấu trúc (số nhà + tên đường / phường / tỉnh). Tìm theo chữ thì Nominatim bỏ
        //    qua số nhà và trả về điểm giữa con đường ("Số 1, Phố Xốm" ra giữa phố Xốm thay vì ĐH Đại Nam)
        String street = streetQuery(p.detail());
        if (!houseNumbers(p.detail()).isEmpty() && !street.isEmpty()) {
            List<Hit> hits = osmStructuredHits(street, p.ward(), p.province(), 5);
            if (hits == null) error = true;
            else best = better(best, pick(p, hits, true));
            if (best != null && best.precision() == Precision.HOUSE) return found(best);
        }

        // 2. Tìm theo chữ cả địa chỉ
        List<Hit> hits = osmHits(p.full(), 5);
        if (hits == null) error = true;
        else best = better(best, pick(p, hits, true));
        if (best != null && best.precision() != Precision.AREA) return found(best);

        // 3. Đường đánh số ("đường 72", "tỉnh lộ 72", "QL6"): OSM ghi theo mã đường "ĐT.72" / "QL.6" và
        //    thường không có tên, nên tìm chữ "đường 72" không ra
        Optional<String> road = roadNumber(p.detail());
        if (road.isPresent() && (best == null || best.precision() == Precision.AREA)) {
            for (String code : roadCodes(p.detail(), road.get())) {
                List<Hit> roadHits = osmStructuredHits(code, p.ward(), p.province(), 5);
                if (roadHits == null) {
                    error = true;
                    continue;
                }
                Place onRoad = pickRoad(p, roadHits, road.get());
                if (onRoad != null) return found(onRoad);
            }
        }

        // 4. Chưa ra tên đường: tìm riêng Phường/Xã + Tỉnh
        if (best == null) {
            List<Hit> areaHits = osmHits(p.area(), 5);
            if (areaHits == null) error = true;
            else best = pick(p, areaHits, false);
        }
        if (best != null) return found(best);
        if (error) return new Lookup(Optional.empty(), true);
        log.info("Không tìm thấy {} trên bản đồ", p.area());
        return new Lookup(Optional.empty(), false);
    }

    private static Lookup found(Place place) {
        return new Lookup(Optional.of(place), false);
    }

    /** Kết quả chính xác hơn trong hai kết quả (HOUSE > STREET > AREA); bằng nhau thì giữ cái trước. */
    private static Place better(Place a, Place b) {
        if (a == null) return b;
        if (b == null) return a;
        return b.precision().ordinal() < a.precision().ordinal() ? b : a;
    }

    /**
     * Kết quả tốt nhất nằm trong đúng Phường/Xã + Tỉnh: ưu tiên khớp số nhà, rồi tên đường, rồi chỉ phường.
     * Khớp số nhà: kết quả là một địa điểm cụ thể (rank 30, hoặc từ Goong) và có đủ các số trong địa chỉ.
     */
    private static Place pick(Parts p, List<Hit> hits, boolean streetAllowed) {
        Place best = null;
        for (Hit h : hits) {
            // Chỉ tới tỉnh/quốc gia: bỏ. Không dùng OSM_AREA_RANK ở đây vì sau sáp nhập 2025, OSM xếp
            // Phường/Xã ở rank 12; việc kết quả nằm đúng phường đã được inArea kiểm tra
            if (h.rank() >= 0 && h.rank() < OSM_WARD_MIN_RANK) continue;
            if (!inArea(p, h.name())) continue;
            boolean street =
                    streetAllowed
                            && (h.rank() < 0 || h.rank() >= OSM_STREET_RANK)
                            && hasMeaningfulWords(p.detail())
                            && matches(p.detail(), h.name());
            Precision precision = Precision.AREA;
            if (street) {
                boolean place = h.rank() < 0 || h.rank() >= OSM_HOUSE_RANK;
                // Khớp địa điểm cụ thể: đúng số nhà, hoặc khách ghi tên địa điểm không kèm số
                // ("trường đại học Đại Nam") và kết quả chính là địa điểm đó
                boolean exact =
                        houseNumberMatches(p.detail(), h.name())
                                || (h.rank() >= OSM_HOUSE_RANK && houseNumbers(p.detail()).isEmpty());
                precision = place && exact ? Precision.HOUSE : Precision.STREET;
            }
            best = better(best, new Place(h.name(), h.lat(), h.lng(), precision));
            if (precision == Precision.HOUSE) break;
        }
        return best;
    }

    /** "đường 72", "đường tỉnh 72", "tỉnh lộ 72", "ĐT.72", "quốc lộ 6", "QL6"... -> số hiệu đường. */
    private static final java.util.regex.Pattern ROAD =
            java.util.regex.Pattern.compile(
                    "(?iU)(?<!\\w)(?<kind>đường\\s+tỉnh|tỉnh\\s+lộ|đt|tl|quốc\\s+lộ|ql|đường)\\.?\\s*(?<num>\\d+[a-z]?)(?!\\w)");

    /** Số hiệu đường đánh số trong phần chi tiết, nếu có. */
    static Optional<String> roadNumber(String detail) {
        var m = ROAD.matcher(detail);
        return m.find() ? Optional.of(m.group("num").toUpperCase(Locale.ROOT)) : Optional.empty();
    }

    /** Các mã đường cần thử trên OSM: ghi rõ quốc lộ / tỉnh lộ thì thử loại đó, "đường 72" thì thử cả hai. */
    static List<String> roadCodes(String detail, String number) {
        var m = ROAD.matcher(detail);
        String kind = m.find() ? normalize(m.group("kind")) : "duong";
        if (kind.equals("ql") || kind.equals("quoc lo")) return List.of("QL." + number);
        if (kind.equals("duong")) return List.of("ĐT." + number, "QL." + number);
        return List.of("ĐT." + number);
    }

    /** Kết quả là đoạn đường mang mã số đó ("ĐT.72", "QL.6") nằm đúng Phường/Xã + Tỉnh. */
    private static Place pickRoad(Parts p, List<Hit> hits, String number) {
        for (Hit h : hits) {
            if (h.rank() >= 0 && h.rank() < OSM_STREET_RANK) continue;
            if (!inArea(p, h.name())) continue;
            String first = normalize(h.name().split(",")[0]); // "ĐT.72" -> "dt 72"
            if (first.matches("(dt|ql|tl|duong tinh|tinh lo|quoc lo) " + normalize(number)))
                return new Place(h.name(), h.lat(), h.lng(), Precision.STREET);
        }
        return null;
    }

    /** Các số nhà trong phần chi tiết ("Số 186, đường 72" -> 186, 72). */
    static List<String> houseNumbers(String detail) {
        return Arrays.stream(lowerWords(detail).split(" ")).filter(w -> !w.isEmpty() && w.chars().allMatch(Character::isDigit)).toList();
    }

    /** Kết quả có đủ các số trong địa chỉ (đứng thành số riêng, không tính "12120" chứa "1"). */
    static boolean houseNumberMatches(String detail, String found) {
        List<String> numbers = houseNumbers(detail);
        if (numbers.isEmpty()) return false;
        Set<String> foundWords = new HashSet<>(List.of(lowerWords(found).split(" ")));
        return foundWords.containsAll(numbers);
    }

    /** Phần chi tiết dạng Nominatim hiểu: bỏ chữ "Số" / "Số nhà" và dấu phẩy ("Số 1, Phố Xốm" -> "1 Phố Xốm"). */
    static String streetQuery(String detail) {
        return detail.replaceAll("(?iU)\\b(số\\s+nhà|số|sn)\\b\\.?", " ").replace(",", " ").replaceAll("\\s+", " ").trim();
    }

    /** Kết quả có nằm trong đúng Phường/Xã và Tỉnh/Thành phố của địa chỉ không. */
    static boolean inArea(Parts p, String found) {
        return nameMatches(p.ward(), found) && nameMatches(p.province(), found);
    }

    /**
     * So một tên hành chính. Tên chỉ có số ("Phường 12") thì so cả cụm, vì bỏ chữ "Phường" và số đi thì
     * không còn gì để so.
     */
    private static boolean nameMatches(String name, String found) {
        if (hasMeaningfulWords(name)) return matches(name, found);
        return (" " + normalize(found) + " ").contains(" " + normalize(name) + " ");
    }

    // ------------------------------------------------------------------ Gọi dịch vụ bản đồ

    /** Kết quả thô của Goong; null nếu gọi bị lỗi. */
    private List<Hit> goongHits(String text, int limit) {
        List<Hit> out = new ArrayList<>();
        try {
            URI uri =
                    UriComponentsBuilder.fromUriString(GOONG + "/geocode")
                            .queryParam("address", text)
                            .queryParam("api_key", apiKey)
                            .encode()
                            .build()
                            .toUri();
            JsonNode body = http.getForObject(uri, JsonNode.class);
            if (body == null) return out;
            for (JsonNode r : body.path("results")) {
                JsonNode loc = r.path("geometry").path("location");
                if (!loc.has("lat") || !loc.has("lng")) continue;
                out.add(new Hit(r.path("formatted_address").asText(""), loc.get("lat").asDouble(), loc.get("lng").asDouble(), -1));
                if (out.size() >= limit) break;
            }
        } catch (RestClientException e) {
            log.warn("Goong geocode lỗi: {}", e.getClass().getSimpleName());
            return null;
        }
        return out;
    }

    /** Kết quả thô của Nominatim (tìm theo chữ); null nếu gọi bị lỗi. */
    private List<Hit> osmHits(String text, int limit) {
        return osmCall(UriComponentsBuilder.fromUriString(NOMINATIM + "/search").queryParam("q", text), limit);
    }

    /**
     * Tìm có cấu trúc: street = "số nhà + tên đường", city = Phường/Xã, state = Tỉnh. Nominatim khớp được
     * số nhà của địa điểm (addr:housenumber), điều mà tìm theo chữ thường bỏ qua.
     */
    private List<Hit> osmStructuredHits(String street, String ward, String province, int limit) {
        return osmCall(
                UriComponentsBuilder.fromUriString(NOMINATIM + "/search")
                        .queryParam("street", street)
                        .queryParam("city", ward)
                        .queryParam("state", province)
                        .queryParam("country", "Việt Nam"),
                limit);
    }

    private List<Hit> osmCall(UriComponentsBuilder query, int limit) {
        List<Hit> out = new ArrayList<>();
        try {
            waitForNominatim();
            URI uri =
                    query.queryParam("format", "jsonv2")
                            .queryParam("countrycodes", "vn")
                            .queryParam("accept-language", "vi")
                            .queryParam("limit", limit)
                            .encode()
                            .build()
                            .toUri();
            JsonNode body = http.getForObject(uri, JsonNode.class);
            if (body == null) return out;
            for (JsonNode r : body) {
                if (!r.has("lat") || !r.has("lon")) continue;
                out.add(new Hit(r.path("display_name").asText(""), r.get("lat").asDouble(), r.get("lon").asDouble(), r.path("place_rank").asInt(0)));
            }
        } catch (RestClientException e) {
            log.warn("Nominatim search lỗi: {}", e.getClass().getSimpleName());
            return null;
        }
        return out;
    }

    // ------------------------------------------------------------------ Tìm theo cả chuỗi (địa chỉ không theo định dạng)

    /** Trả về null nếu gọi Goong bị lỗi. */
    private List<Place> goongSearch(String address, int limit) {
        List<Hit> hits = goongHits(address, limit);
        if (hits == null) return null;
        List<Place> out = new ArrayList<>();
        for (Hit h : hits) {
            // Goong luôn trả về kết quả "gần giống nhất" kể cả với địa chỉ bịa, nên phải tự so chữ
            Precision precision = goongPrecision(address, h.name());
            if (precision == null) {
                log.info("Goong trả kết quả không khớp địa chỉ, bỏ qua: {}", h.name());
                continue;
            }
            out.add(new Place(h.name(), h.lat(), h.lng(), precision));
        }
        return out;
    }

    /**
     * OpenStreetMap thường không tìm được số nhà ở Việt Nam, nên nếu không ra kết quả thì bỏ dần phần
     * đầu địa chỉ ("123 Đường X, Phường Y, Hà Nội" -> "Phường Y, Hà Nội" -> "Hà Nội") để ít nhất lấy được
     * vị trí gần đúng theo khu vực. Trả về null nếu gọi Nominatim bị lỗi.
     */
    private List<Place> osmSearchLoose(String address, int limit) {
        String text = address.trim();
        while (true) {
            boolean trimmed = !text.equals(address.trim());
            List<Place> found = osmSearch(text, limit, trimmed);
            if (found == null) return null; // lỗi dịch vụ: chưa biết địa chỉ có thật hay không
            if (!found.isEmpty()) {
                if (trimmed) log.info("OpenStreetMap chỉ tìm được vị trí gần đúng theo khu vực: {}", text);
                return found;
            }
            int comma = text.indexOf(',');
            if (comma < 0) return List.of();
            text = text.substring(comma + 1).trim();
            if (text.isEmpty()) return List.of();
        }
    }

    /** trimmed = true: đã bỏ bớt phần đầu địa chỉ nên kết quả tốt nhất cũng chỉ là AREA. Lỗi gọi API trả về null. */
    private List<Place> osmSearch(String text, int limit, boolean trimmed) {
        List<Hit> hits = osmHits(text, Math.max(limit, 5));
        if (hits == null) return null;
        List<Place> out = new ArrayList<>();
        for (Hit h : hits) {
            // Chỉ khớp tới quận/tỉnh/thành phố: bỏ, không lấy tâm thành phố làm điểm giao
            if (h.rank() < OSM_AREA_RANK) continue;
            // Nominatim có thể bỏ qua bớt chữ khi tìm ("Thành An Đông Lỗ" ra "Phường An Đông, TP.HCM"),
            // nên mọi chữ có nghĩa của câu tìm phải có trong kết quả
            if (!matches(text, h.name())) {
                log.info("OpenStreetMap trả kết quả thiếu chữ so với địa chỉ, bỏ qua: {}", h.name());
                continue;
            }
            Precision precision = !trimmed && h.rank() >= OSM_STREET_RANK ? Precision.STREET : Precision.AREA;
            out.add(new Place(h.name(), h.lat(), h.lng(), precision));
            if (out.size() >= limit) break;
        }
        return out;
    }

    // ------------------------------------------------------------------ Tọa độ -> địa chỉ

    /** Đổi tọa độ khách ghim trên bản đồ thành địa chỉ dạng chữ. */
    public Optional<String> reverse(double lat, double lng) {
        if (useGoong()) {
            Optional<String> found = goongReverse(lat, lng);
            if (found.isPresent()) return found;
            log.info("Goong không đổi được tọa độ thành địa chỉ, chuyển sang OpenStreetMap");
        }
        return osmReverse(lat, lng);
    }

    private Optional<String> goongReverse(double lat, double lng) {
        try {
            URI uri =
                    UriComponentsBuilder.fromUriString(GOONG + "/Geocode")
                            .queryParam("latlng", lat + "," + lng)
                            .queryParam("api_key", apiKey)
                            .encode()
                            .build()
                            .toUri();
            JsonNode body = http.getForObject(uri, JsonNode.class);
            String text = body == null ? "" : body.path("results").path(0).path("formatted_address").asText("");
            return text.isBlank() ? Optional.empty() : Optional.of(text);
        } catch (RestClientException e) {
            log.warn("Goong reverse geocode lỗi: {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    private Optional<String> osmReverse(double lat, double lng) {
        try {
            waitForNominatim();
            URI uri =
                    UriComponentsBuilder.fromUriString(NOMINATIM + "/reverse")
                            .queryParam("lat", lat)
                            .queryParam("lon", lng)
                            .queryParam("format", "jsonv2")
                            .queryParam("accept-language", "vi")
                            .encode()
                            .build()
                            .toUri();
            JsonNode body = http.getForObject(uri, JsonNode.class);
            String text = body == null ? "" : body.path("display_name").asText("");
            return text.isBlank() ? Optional.empty() : Optional.of(text);
        } catch (RestClientException e) {
            log.warn("Nominatim reverse lỗi: {}", e.getClass().getSimpleName());
            return Optional.empty();
        }
    }

    // ------------------------------------------------------------------ Quãng đường

    /** Quãng đường đi từ {@code from} tới {@code to}; lỗi thì ước tính theo đường thẳng. */
    public Route route(LatLng from, LatLng to) {
        Optional<Integer> meters = Optional.empty();
        if (useGoong()) {
            meters = goongRoute(from, to);
            if (meters.isEmpty()) log.info("Goong không tính được quãng đường, chuyển sang OSRM");
        }
        if (meters.isEmpty()) meters = osrmRoute(from, to);
        return meters
                .map(m -> new Route(m, false))
                .orElseGet(() -> new Route((int) Math.round(straightLineMeters(from, to) * ROAD_FACTOR), true));
    }

    private Optional<Integer> goongRoute(LatLng from, LatLng to) {
        try {
            URI uri =
                    UriComponentsBuilder.fromUriString(GOONG + "/DistanceMatrix")
                            .queryParam("origins", from.lat() + "," + from.lng())
                            .queryParam("destinations", to.lat() + "," + to.lng())
                            .queryParam("vehicle", "bike")
                            .queryParam("api_key", apiKey)
                            .encode()
                            .build()
                            .toUri();
            JsonNode body = http.getForObject(uri, JsonNode.class);
            JsonNode distance = body == null ? null : body.path("rows").path(0).path("elements").path(0).path("distance");
            if (distance != null && distance.has("value")) return Optional.of(distance.get("value").asInt());
        } catch (RestClientException e) {
            log.warn("Goong DistanceMatrix lỗi: {}", e.getClass().getSimpleName());
        }
        return Optional.empty();
    }

    /** OSRM nhận tọa độ theo thứ tự kinh độ,vĩ độ. */
    private Optional<Integer> osrmRoute(LatLng from, LatLng to) {
        try {
            URI uri =
                    URI.create(
                            OSRM + "/route/v1/driving/" + from.lng() + "," + from.lat() + ";" + to.lng() + ","
                                    + to.lat() + "?overview=false");
            JsonNode body = http.getForObject(uri, JsonNode.class);
            if (body != null && "Ok".equals(body.path("code").asText()) && body.path("routes").path(0).has("distance"))
                return Optional.of((int) Math.round(body.path("routes").path(0).get("distance").asDouble()));
        } catch (RestClientException e) {
            log.warn("OSRM lỗi: {}", e.getClass().getSimpleName());
        }
        return Optional.empty();
    }

    // ------------------------------------------------------------------ So khớp chữ

    /**
     * Mức khớp giữa địa chỉ khách nhập và địa chỉ Goong trả về. Phần đầu địa chỉ (trước dấu phẩy đầu tiên)
     * là số nhà / tên đường; các phần giữa là phường, quận; phần cuối là tỉnh/thành phố (không tính).
     * Trả về null nếu không khớp cả tên đường lẫn phường/quận.
     */
    static Precision goongPrecision(String input, String found) {
        String[] parts = input.split(",");
        if (parts.length > 0 && hasMeaningfulWords(parts[0]) && matches(parts[0], found)) return Precision.STREET;
        for (int i = 1; i < parts.length - 1; i++)
            if (hasMeaningfulWords(parts[i]) && matches(parts[i], found)) return Precision.AREA;
        return null;
    }

    /**
     * Mọi từ có nghĩa (bỏ số và từ chung chung như "đường", "phường") của {@code text} đều có trong
     * {@code found}. Từ khách gõ có dấu thì so cả dấu ("Lỗ" khác "Lô"); gõ không dấu thì so không dấu.
     */
    static boolean matches(String text, String found) {
        Set<String> exact = new HashSet<>();
        for (String w : lowerWords(found).split(" ")) exact.add(toneKey(w));
        Set<String> plain = new HashSet<>(List.of(normalize(found).split(" ")));
        for (String w : lowerWords(text).split(" ")) {
            if (!isMeaningful(w)) continue;
            String p = normalize(w);
            boolean hasMarks = !p.equals(w);
            if (hasMarks ? !exact.contains(toneKey(w)) : !plain.contains(p)) return false;
        }
        return true;
    }

    /**
     * Khóa so sánh có dấu, không phụ thuộc vị trí đặt dấu thanh ("hoà" và "hòa" như nhau): giữ chữ và dấu
     * mũ/móc/trăng, tách dấu thanh ra cuối.
     */
    private static String toneKey(String w) {
        String d = Normalizer.normalize(w, Normalizer.Form.NFD);
        StringBuilder base = new StringBuilder();
        char tone = '-';
        for (char c : d.toCharArray()) {
            if (c == '̀' || c == '́' || c == '̃' || c == '̉' || c == '̣') tone = c;
            else base.append(c);
        }
        return Normalizer.normalize(base, Normalizer.Form.NFC) + tone;
    }

    private static boolean hasMeaningfulWords(String text) {
        return Arrays.stream(lowerWords(text).split(" ")).anyMatch(GeoClient::isMeaningful);
    }

    private static boolean isMeaningful(String w) {
        if (w.isEmpty() || w.chars().allMatch(Character::isDigit)) return false;
        String p = normalize(w);
        // Gõ có dấu: so với danh sách có dấu; gõ không dấu: so với danh sách không dấu
        return p.equals(w) ? !GENERIC_WORDS_PLAIN.contains(p) : !GENERIC_WORDS.contains(w);
    }

    /** Chữ thường, giữ dấu tiếng Việt, chỉ giữ chữ và số (dấu câu thành khoảng trắng). */
    private static String lowerWords(String s) {
        String composed = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
        return composed.replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    /** Bỏ dấu tiếng Việt, chữ thường, chỉ giữ chữ và số. */
    static String normalize(String s) {
        String noMarks = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        return noMarks.replace('đ', 'd').replace('Đ', 'D').toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim();
    }

    /** Khoảng cách đường thẳng trên mặt cầu (công thức haversine). */
    static double straightLineMeters(LatLng a, LatLng b) {
        double r = 6_371_000;
        double dLat = Math.toRadians(b.lat() - a.lat());
        double dLng = Math.toRadians(b.lng() - a.lng());
        double h =
                Math.sin(dLat / 2) * Math.sin(dLat / 2)
                        + Math.cos(Math.toRadians(a.lat())) * Math.cos(Math.toRadians(b.lat()))
                        * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * r * Math.asin(Math.sqrt(h));
    }

    /** Nominatim chỉ cho tối đa 1 lượt/giây. */
    private synchronized void waitForNominatim() {
        long wait = lastNominatimCall + 1100 - System.currentTimeMillis();
        if (wait > 0) {
            try {
                Thread.sleep(wait);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        lastNominatimCall = System.currentTimeMillis();
    }
}
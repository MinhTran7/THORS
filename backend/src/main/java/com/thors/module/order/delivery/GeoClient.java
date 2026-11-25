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
import org.springframework.boot.web.client.RestTemplateBuilder;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriComponentsBuilder;

/**
 * Đổi địa chỉ thành tọa độ bằng OpenStreetMap (Nominatim, miễn phí, giới hạn 1 lượt/giây). Hiện chỉ module
 * Facebook dùng: kiểm tra địa chỉ trước khi tạo đơn và lưu tọa độ của đơn.
 */
@Component
public class GeoClient {
    private static final Logger log = LoggerFactory.getLogger(GeoClient.class);
    private static final String NOMINATIM = "https://nominatim.openstreetmap.org";

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

    private final RestTemplate http;
    private long lastNominatimCall = 0;

    public GeoClient(RestTemplateBuilder builder) {
        this.http =
                builder.setConnectTimeout(Duration.ofSeconds(3))
                        .setReadTimeout(Duration.ofSeconds(6))
                        // Nominatim yêu cầu User-Agent nhận diện được ứng dụng
                        .defaultHeader("User-Agent", "thors-backend/1.0 (dev test)")
                        .build();
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
        List<Place> found = osmSearchLoose(address, 1);
        if (found == null) return new Lookup(Optional.empty(), true);
        return new Lookup(found.stream().findFirst(), false);
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

    /** Một kết quả thô từ Nominatim; rank = place_rank. */
    private record Hit(String name, double lat, double lng, int rank) {}

    /**
     * Tìm theo từng phần: kết quả phải nằm đúng Phường/Xã và Tỉnh khách đã chọn. Khớp thêm tên đường thì
     * là STREET, không thì AREA. Không có kết quả nào trong đúng Phường/Xã + Tỉnh đó: không tìm thấy.
     */
    private Lookup structuredLookup(Parts p) {
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
     * Khớp số nhà: kết quả là một địa điểm cụ thể (rank 30) và có đủ các số trong địa chỉ.
     */
    private static Place pick(Parts p, List<Hit> hits, boolean streetAllowed) {
        Place best = null;
        for (Hit h : hits) {
            // Chỉ tới tỉnh/quốc gia: bỏ. Không dùng OSM_AREA_RANK ở đây vì sau sáp nhập 2025, OSM xếp
            // Phường/Xã ở rank 12; việc kết quả nằm đúng phường đã được inArea kiểm tra
            if (h.rank() < OSM_WARD_MIN_RANK) continue;
            if (!inArea(p, h.name())) continue;
            boolean street =
                    streetAllowed
                            && h.rank() >= OSM_STREET_RANK
                            && hasMeaningfulWords(p.detail())
                            && matches(p.detail(), h.name());
            Precision precision = Precision.AREA;
            if (street) {
                boolean place = h.rank() >= OSM_HOUSE_RANK;
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
            if (h.rank() < OSM_STREET_RANK) continue;
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

    // ------------------------------------------------------------------ So khớp chữ

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
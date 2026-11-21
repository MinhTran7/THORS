package com.thors.module.website;

import com.thors.common.ApiException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * Kênh bán hàng > Website: chủ cửa hàng sửa thông tin chung hiển thị trên website.
 *  - GET /api/shop/website        : ai cũng đọc được (header/footer của trang khách dùng)
 *  - GET /api/website-settings    : Owner, mở trang quản lý
 *  - PUT /api/website-settings    : Owner, lưu
 */
@RestController
public class WebsiteSettingController {

    /** Các khóa được phép lưu và độ dài tối đa của từng khóa. */
    private static final Map<String, Integer> FIELDS = new LinkedHashMap<>();

    static {
        FIELDS.put("announcement", 200); // thanh thông báo trên cùng
        FIELDS.put("tagline", 300);      // câu giới thiệu dưới logo ở footer
        FIELDS.put("about", 1000);       // cột "Về THORS", mỗi dòng một ý
        FIELDS.put("hotline", 50);
        FIELDS.put("email", 120);
        FIELDS.put("address", 300);      // địa chỉ đầy đủ đã ghép sẵn để hiển thị
        FIELDS.put("addressDetail", 255); // số nhà, tên đường
        FIELDS.put("provinceCode", 20);   // mã tỉnh/thành (để mở lại đúng lựa chọn)
        FIELDS.put("wardCode", 20);       // mã phường/xã
        FIELDS.put("closingNote", 200);  // dòng chữ góc phải cuối footer
    }

    private final WebsiteSettingRepository repository;

    public WebsiteSettingController(WebsiteSettingRepository repository) {
        this.repository = repository;
    }

    @GetMapping("/api/shop/website")
    public Map<String, Object> publicSettings() {
        return Map.of("settings", known(repository.findAll()));
    }

    @GetMapping("/api/website-settings")
    public Map<String, Object> settings() {
        requireOwner();
        return Map.of("settings", known(repository.findAll()));
    }

    @PutMapping("/api/website-settings")
    @Transactional
    public Map<String, Object> update(@RequestBody Map<String, Object> body) {
        requireOwner();
        if (body == null) throw new ApiException(400, "VALIDATION", "Thiếu dữ liệu.");
        Map<String, String> values = new LinkedHashMap<>();
        for (Map.Entry<String, Integer> field : FIELDS.entrySet()) {
            if (!body.containsKey(field.getKey())) continue;
            Object raw = body.get(field.getKey());
            String value = raw == null ? "" : String.valueOf(raw).trim();
            if (value.length() > field.getValue()) {
                throw new ApiException(400, "VALIDATION",
                        "Nội dung quá dài (tối đa " + field.getValue() + " ký tự): " + field.getKey());
            }
            if ("hotline".equals(field.getKey()) && !value.isEmpty() && !value.matches("\\d{4}\\.\\d{3}\\.\\d{3}")) {
                throw new ApiException(400, "VALIDATION", "Hotline phải có dạng xxxx.xxx.xxx (đủ 10 chữ số).");
            }
            values.put(field.getKey(), value);
        }
        repository.saveAll(values);
        return Map.of("settings", known(repository.findAll()));
    }

    // Chỉ trả về các khóa đã khai báo
    private static Map<String, String> known(Map<String, String> all) {
        Map<String, String> result = new LinkedHashMap<>();
        FIELDS.keySet().forEach(key -> {
            if (all.containsKey(key)) result.put(key, all.get(key));
        });
        return result;
    }

    private static void requireOwner() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean owner = auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_OWNER".equals(a.getAuthority()));
        if (!owner) throw new ApiException(403, "FORBIDDEN", "Chỉ chủ cửa hàng được sửa thông tin website.");
    }
}

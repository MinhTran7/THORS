package com.thors.module.warehouse;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WarehouseBarcodes {
    private final WarehouseStore s;
    private final WarehousePolicy policy;

    public WarehouseBarcodes(WarehouseStore s, WarehousePolicy policy) {
        this.s = s;
        this.policy = policy;
    }

    /**
     * Assign codes only to variants that do not have one (all of them, or the selected ids). An
     * existing code is never replaced, so printed labels stay valid. A new code is TH + 6-digit
     * variant id; if that text is already used by another variant a suffix is added until unique.
     */
    @Transactional
    public Map<String, Object> generate(Account actor, java.util.List<Integer> only) {
        policy.owner(actor);
        s.lock();
        var ids = s.jdbc().queryForList(
                "SELECT detail_id FROM product_detail WHERE barcode IS NULL OR barcode='' ORDER BY detail_id FOR UPDATE",
                Integer.class);
        if (only != null && !only.isEmpty()) ids = ids.stream().filter(only::contains).toList();
        int generated = 0;
        var codes = new java.util.ArrayList<String>();
        try {
            for (int id : ids) {
                String base = String.format(Locale.ROOT, "TH%06d", id), code = base;
                for (int n = 1; s.count("SELECT COUNT(*) FROM product_detail WHERE barcode=?", code) > 0; n++)
                    code = base + "-" + n;
                int done = s.jdbc().update(
                        "UPDATE product_detail SET barcode=? WHERE detail_id=? AND (barcode IS NULL OR barcode='')",
                        code, id);
                generated += done;
                if (done == 1) codes.add(code);
            }
        } catch (DuplicateKeyException ex) {
            throw new ApiException(409, "BARCODE_CONFLICT", "Có mã vạch bị trùng. Vui lòng kiểm tra dữ liệu mã vạch hiện có.");
        }
        if (generated > 0) s.audit(actor.id(), "BARCODE_GENERATE", 0, trim("Tạo " + generated + " mã vạch còn thiếu: " + String.join(", ", codes)));
        return Map.of("generated", generated, "codes", codes);
    }

    private static String trim(String v) {
        return v.length() > 480 ? v.substring(0, 477) + "..." : v;
    }

    public Map<String, Object> generate(Account actor) {
        return generate(actor, null);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> lookup(Account actor, String rawCode) {
        policy.view(actor);
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9._-]{1,32}")) {
            throw new ApiException(400, "INVALID_BARCODE", "Mã vạch không hợp lệ.");
        }
        var rows = s.jdbc().queryForList("""
                SELECT d.detail_id,d.product_id,d.barcode,d.color,d.size,d.price,d.stock_quantity,d.status,p.product_name,
                  p.status AS product_status,
                  COALESCE(l.assigned,0) AS assigned_quantity,
                  GREATEST(0,d.stock_quantity-COALESCE(l.assigned,0)) AS unassigned_quantity,
                  (SELECT pi.image_url FROM product_image pi
                   WHERE pi.product_id=d.product_id AND pi.deleted_at IS NULL
                   ORDER BY pi.is_primary DESC,pi.image_id ASC LIMIT 1) AS image_url
                FROM product_detail d JOIN product p ON p.product_id=d.product_id
                LEFT JOIN (SELECT detail_id,SUM(quantity) AS assigned FROM product_location GROUP BY detail_id) l
                  ON l.detail_id=d.detail_id
                WHERE d.barcode=?
                """, code);
        if (rows.isEmpty()) {
            throw new ApiException(404, "BARCODE_NOT_FOUND", "Không tìm thấy hàng hóa có mã vạch này.");
        }
        var variant = rows.get(0);
        var locations = s.jdbc().queryForList("""
                SELECT l.product_location_id,l.shelf_level_id,l.quantity,l.description,
                  r.rack_code,t.level_number
                FROM product_location l
                JOIN shelf_level t ON t.shelf_level_id=l.shelf_level_id
                JOIN rack r ON r.rack_id=t.rack_id
                WHERE l.detail_id=? AND l.quantity>0
                ORDER BY r.rack_code,t.level_number
                """, variant.get("detail_id"));
        return Map.of("variant", variant, "locations", locations);
    }
}

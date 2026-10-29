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

    /** Assign codes only to variants that do not have one. Repeated calls keep printed labels valid. */
    @Transactional
    public Map<String, Object> generate(Account actor) {
        policy.owner(actor);
        s.lock();
        var ids = s.jdbc().queryForList(
                "SELECT detail_id FROM product_detail WHERE barcode IS NULL OR barcode='' ORDER BY detail_id FOR UPDATE",
                Integer.class);
        int generated = 0;
        try {
            for (int id : ids) {
                String code = String.format(Locale.ROOT, "TH%06d", id);
                generated += s.jdbc().update(
                        "UPDATE product_detail SET barcode=? WHERE detail_id=? AND (barcode IS NULL OR barcode='')",
                        code, id);
            }
        } catch (DuplicateKeyException ex) {
            throw new ApiException(409, "BARCODE_CONFLICT", "Có mã vạch bị trùng. Vui lòng kiểm tra dữ liệu mã vạch hiện có.");
        }
        if (generated > 0) s.audit(actor.id(), "BARCODE_GENERATE", 0, "Tạo " + generated + " mã vạch còn thiếu.");
        return Map.of("generated", generated);
    }

    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> lookup(Account actor, String rawCode) {
        policy.view(actor);
        String code = rawCode == null ? "" : rawCode.trim().toUpperCase(Locale.ROOT);
        if (!code.matches("[A-Z0-9._-]{1,32}")) {
            throw new ApiException(400, "INVALID_BARCODE", "Mã vạch không hợp lệ.");
        }
        var rows = s.jdbc().queryForList("""
                SELECT d.detail_id,d.product_id,d.barcode,d.color,d.size,d.stock_quantity,d.status,p.product_name,
                  COALESCE(l.assigned,0) AS assigned_quantity,
                  d.stock_quantity-COALESCE(l.assigned,0) AS unassigned_quantity,
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

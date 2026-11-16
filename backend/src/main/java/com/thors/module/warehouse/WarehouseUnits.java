package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/** Danh sách serial từng chiếc, tem serial cho phiếu nhập, đánh dấu đã in tem. */
@Service
@Transactional(isolation = Isolation.READ_COMMITTED)
public class WarehouseUnits {
    /** Mỗi lần xem tối đa ngần này chiếc (một biến thể hiếm khi có nhiều hơn). */
    static final int LIMIT = 5000;

    private final WarehouseStore s;
    private final WarehousePolicy policy;

    public WarehouseUnits(WarehouseStore s, WarehousePolicy policy) {
        this.s = s;
        this.policy = policy;
    }

    private void requireTable() {
        if (!s.units().ready())
            throw new ApiException(
                    503,
                    "MIGRATION_REQUIRED",
                    "Database chưa có bảng serial từng chiếc. Cần chạy database/migrations/2026-11-16_product_unit.sql.");
    }

    /** Cột của một chiếc; có thêm lỗi đang mở (defect_*) khi database đã có bảng hàng lỗi. */
    private String columns() {
        if (!s.units().defectsReady()) return COLUMNS;
        // Lỗi đang mở của chiếc (defect_id = unit_id khi đang lỗi, null khi không)
        return COLUMNS
                .replace("o.order_id,o.order_number", "o.order_id,o.order_number,"
                        + "CASE WHEN u.defect_status='OPEN' THEN u.unit_id END AS defect_id,u.defect_status,u.defect_types,"
                        + "u.defect_note AS defect_description,u.defect_source,u.defect_photos AS defect_photo_keys,"
                        + "u.defect_at AS defect_reported_at,du.full_name AS defect_reporter")
                .replace("LEFT JOIN orders o ON o.order_id=oi.order_id",
                        "LEFT JOIN orders o ON o.order_id=oi.order_id LEFT JOIN `user` du ON du.user_id=u.defect_by");
    }

    private static final String COLUMNS =
            """
            SELECT u.unit_id,u.serial_code,u.seq,u.status,u.detail_id,u.product_location_id,u.in_receipt_item_id,
              u.out_order_item_id,u.out_receipt_item_id,u.note,u.printed_at,u.scanned_at,u.created_at,u.in_at,u.out_at,
              d.color,d.size,d.price,d.barcode,d.product_id,p.product_name,
              r.rack_code,t.level_number,ri.receipt_id AS in_receipt_id,ro.receipt_id AS out_receipt_id,
              o.order_id,o.order_number
            FROM product_unit u
            JOIN product_detail d ON d.detail_id=u.detail_id JOIN product p ON p.product_id=d.product_id
            LEFT JOIN product_location l ON l.product_location_id=u.product_location_id
            LEFT JOIN shelf_level t ON t.shelf_level_id=l.shelf_level_id LEFT JOIN rack r ON r.rack_id=t.rack_id
            LEFT JOIN stock_receipt_item ri ON ri.receipt_item_id=u.in_receipt_item_id
            LEFT JOIN stock_receipt_item ro ON ro.receipt_item_id=u.out_receipt_item_id
            LEFT JOIN order_item oi ON oi.order_item_id=u.out_order_item_id LEFT JOIN orders o ON o.order_id=oi.order_id
            """;

    private List<Map<String, Object>> shaped(List<Map<String, Object>> rows) {
        var offset = s.clockOffset();
        var out = new ArrayList<Map<String, Object>>(rows.size());
        for (var row : rows) {
            var m = copy(row);
            m.put("location", row.get("rack_code") == null ? null : "" + row.get("rack_code") + row.get("level_number"));
            storeTime(m, offset, "printed_at", "scanned_at", "created_at", "in_at", "out_at", "defect_reported_at");
            out.add(m);
        }
        return out;
    }

    /**
     * Serial của một hay nhiều biến thể, mới đối chiếu với tồn hiện tại. {@code status} rỗng = mọi trạng
     * thái; {@code unprinted} = chỉ chiếc đang trong kho chưa in tem.
     */
    public Map<String, Object> list(Account a, List<Integer> details, String status, boolean unprinted) {
        return list(a, details, status, unprinted, false);
    }

    /** {@code defective} = chỉ chiếc đang báo lỗi. */
    public Map<String, Object> list(Account a, List<Integer> details, String status, boolean unprinted, boolean defective) {
        policy.view(a);
        requireTable();
        if (details == null || details.isEmpty()) throw invalid("Chọn biến thể cần xem mã.");
        if (details.size() > 200) throw invalid("Mỗi lần xem tối đa 200 biến thể.");
        var ids = details.stream().distinct().sorted().toList();
        s.lock();
        for (int id : ids) s.units().sync(id);
        var where = new StringBuilder(" WHERE u.detail_id IN (" + ProductUnits.marks(ids.size()) + ")");
        var args = new ArrayList<Object>(ids);
        boolean defects = s.units().defectsReady();
        if (defective && defects) where.append(" AND u.defect_status='OPEN'");
        else if (unprinted) where.append(" AND u.status='IN_STOCK' AND u.printed_at IS NULL");
        else if (status != null && !status.isBlank()) {
            where.append(" AND u.status=?");
            args.add(status.trim().toUpperCase(Locale.ROOT));
        }
        var rows = s.jdbc().queryForList(columns() + where + " ORDER BY u.detail_id,u.seq LIMIT " + (LIMIT + 1), args.toArray());
        var counts = new LinkedHashMap<String, Long>();
        for (var row : s.jdbc().queryForList(
                "SELECT status,COUNT(*) AS n FROM product_unit WHERE detail_id IN (" + ProductUnits.marks(ids.size())
                        + ") GROUP BY status",
                ids.toArray()))
            counts.put((String) row.get("status"), ((Number) row.get("n")).longValue());
        long unprintedCount = s.count(
                "SELECT COUNT(*) FROM product_unit WHERE status='IN_STOCK' AND printed_at IS NULL AND detail_id IN ("
                        + ProductUnits.marks(ids.size()) + ")",
                ids.toArray());
        long defectCount = defects
                ? s.count("SELECT COUNT(*) FROM product_unit WHERE defect_status='OPEN' AND detail_id IN ("
                        + ProductUnits.marks(ids.size()) + ")", ids.toArray())
                : 0;
        boolean more = rows.size() > LIMIT;
        return Map.of(
                "defective", defectCount,
                "units", shaped(more ? rows.subList(0, LIMIT) : rows),
                "truncated", more,
                "counts", counts,
                "unprinted", unprintedCount);
    }

    /** Ghi nhận đã in tem cho các chiếc này (để lọc "chưa in tem"). */
    public Map<String, Object> printed(Account a, List<Integer> unitIds) {
        policy.view(a);
        requireTable();
        if (unitIds == null || unitIds.isEmpty()) return Map.of("updated", 0);
        if (unitIds.size() > LIMIT) throw invalid("Mỗi lần in tối đa " + LIMIT + " tem.");
        int updated = 0;
        for (var chunk : ProductUnits.chunks(unitIds.stream().distinct().toList()))
            updated += s.jdbc().update(
                    "UPDATE product_unit SET printed_at=CURRENT_TIMESTAMP WHERE unit_id IN (" + ProductUnits.marks(chunk.size()) + ")",
                    chunk.toArray());
        return Map.of("updated", updated);
    }

    /**
     * Tem serial cho phiếu nhập đang chờ kiểm hàng: mỗi dòng có đủ tem chờ nhận bằng số trên phiếu (in lại
     * không sinh mã mới). {@code extra} sinh thêm tem cho một dòng (hàng giao thừa, tem hỏng).
     */
    public Map<String, Object> receiptLabels(Account a, int receiptId, Integer itemId, Integer extra) {
        policy.create(a, "RECEIPT");
        requireTable();
        s.lock();
        var doc = s.one("SELECT receipt_type,status FROM stock_receipt WHERE receipt_id=?", receiptId);
        if (!is(doc, "receipt_type", "RECEIPT") || !is(doc, "status", "APPROVED"))
            throw invalid("Chỉ in tem serial cho phiếu nhập đang chờ kiểm hàng.");
        var lines = s.jdbc().queryForList(
                "SELECT receipt_item_id,detail_id,quantity FROM stock_receipt_item WHERE receipt_id=? ORDER BY receipt_item_id",
                receiptId);
        if (extra != null && (extra < 1 || extra > 1000)) throw invalid("Số tem thêm phải từ 1 đến 1000.");
        if (itemId != null && lines.stream().noneMatch(l -> num(l, "receipt_item_id") == itemId))
            throw invalid("Dòng hàng không thuộc phiếu nhập này.");
        for (var l : lines) {
            int item = num(l, "receipt_item_id");
            long have = s.count("SELECT COUNT(*) FROM product_unit WHERE in_receipt_item_id=? AND status='PENDING'", item);
            int add = (int) Math.max(0, num(l, "quantity") - have);
            if (extra != null && itemId != null && itemId == item) add += extra;
            s.units().create(num(l, "detail_id"), add, ProductUnits.PENDING, null, item, "Tem in khi kiểm hàng phiếu nhập #" + receiptId);
        }
        var rows = s.jdbc().queryForList(
                columns() + " WHERE u.status='PENDING' AND ri.receipt_id=?"
                        + (itemId != null ? " AND u.in_receipt_item_id=" + itemId : "")
                        + " ORDER BY u.in_receipt_item_id,u.seq",
                receiptId);
        return Map.of("units", shaped(rows));
    }

    /** Một serial (để tra cứu/quét); null nếu không có. Đối chiếu biến thể đó trước khi trả. Người gọi giữ khóa kho. */
    public Map<String, Object> find(String code) {
        if (!ProductUnits.looksSerial(code) || !s.units().ready()) return null;
        var detail = s.jdbc().queryForList("SELECT detail_id FROM product_unit WHERE serial_code=?", Integer.class, code);
        if (detail.isEmpty()) return null;
        s.units().sync(detail.get(0));
        var rows = shaped(s.jdbc().queryForList(columns() + " WHERE u.serial_code=?", code));
        return rows.isEmpty() ? null : rows.get(0);
    }
}

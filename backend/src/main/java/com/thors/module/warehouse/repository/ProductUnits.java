package com.thors.module.warehouse.repository;

import java.util.*;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Sổ hàng lỗi, dùng lại bảng product_unit (migration 2026-11-16_product_unit.sql + 2026-11-17_unit_defect.sql).
 *
 * <p>Kho dùng MÃ CHUNG cho mỗi biến thể (product_detail.barcode): nhập N chiếc thì in N tem giống nhau,
 * mọi thao tác kho tính theo số lượng. Không còn serial từng chiếc. Bảng product_unit chỉ còn để ghi
 * hàng lỗi: báo N chiếc lỗi = thêm N dòng có defect_status='OPEN'. Cột serial_code của các dòng này là mã
 * nội bộ (không in tem, không quét). Các dòng serial cũ không lỗi (defect_status NULL) không còn được đọc.
 *
 * <p>Số chiếc đang lỗi của một biến thể không bao giờ vượt tồn: khi tồn giảm (bán, kiểm kê thiếu...) mà
 * số lỗi đang mở lớn hơn tồn, phần dư được đóng ({@link #clampDefects}). Trả NCC đóng lỗi trước
 * ({@link #closeDefects}), vì hàng lỗi được trả trước.
 *
 * <p>Database chưa chạy migration: mọi hàm ở đây không làm gì (kho vẫn chạy như cũ).
 */
public final class ProductUnits {
    public static final String IN_STOCK = "IN_STOCK",
            SOLD = "SOLD",
            RETURNED_SUPPLIER = "RETURNED_SUPPLIER",
            LOST = "LOST";

    private final JdbcTemplate db;
    private volatile Boolean ready;
    private volatile long checkedAt;
    private volatile Boolean defectsReady;
    private volatile long defectsCheckedAt;

    public ProductUnits(JdbcTemplate db) {
        this.db = db;
    }

    /** Mã nội bộ của một dòng hàng lỗi: TH + 6 số mã biến thể + "-" + số thứ tự 4 số (không in tem). */
    static String internalCode(int detail, int seq) {
        return String.format(Locale.ROOT, "TH%06d-%04d", detail, seq);
    }

    /** Bảng product_unit đã có chưa (kiểm lại mỗi 30 giây khi chưa có). */
    public boolean ready() {
        if (Boolean.TRUE.equals(ready)) return true;
        long now = System.currentTimeMillis();
        if (ready != null && now - checkedAt < 30_000) return false;
        try {
            db.queryForObject("SELECT COUNT(*) FROM product_unit WHERE 1=0", Long.class);
            ready = true;
        } catch (DataAccessException e) {
            ready = false;
        }
        checkedAt = now;
        return ready;
    }

    /** Cột lỗi defect_* của product_unit đã có chưa (migration 2026-11-17_unit_defect.sql). */
    public boolean defectsReady() {
        if (Boolean.TRUE.equals(defectsReady)) return true;
        long now = System.currentTimeMillis();
        if (defectsReady != null && now - defectsCheckedAt < 30_000) return false;
        try {
            db.queryForObject("SELECT COUNT(defect_status) FROM product_unit WHERE 1=0", Long.class);
            defectsReady = true;
        } catch (DataAccessException e) {
            defectsReady = false;
        }
        defectsCheckedAt = now;
        return defectsReady;
    }

    private boolean usable() {
        return ready() && defectsReady();
    }

    /** Số chiếc đang báo lỗi (chưa xử lý) của một biến thể. */
    public int openDefects(int detail) {
        if (!usable()) return 0;
        return db.queryForObject(
                "SELECT COUNT(*) FROM product_unit WHERE detail_id=? AND defect_status='OPEN'", Integer.class, detail);
    }

    /** Thêm {@code count} dòng hàng lỗi (đang trong kho) cho biến thể; trả về unit_id theo thứ tự. */
    public List<Integer> create(int detail, int count, String note) {
        if (count <= 0) return List.of();
        int next = db.queryForObject("SELECT COALESCE(MAX(seq),0) FROM product_unit WHERE detail_id=?", Integer.class, detail) + 1;
        var args = new ArrayList<Object[]>(count);
        var codes = new ArrayList<String>(count);
        for (int i = 0; i < count; i++) {
            String code = internalCode(detail, next + i);
            codes.add(code);
            args.add(new Object[] {detail, next + i, code, IN_STOCK, note});
        }
        db.batchUpdate(
                "INSERT INTO product_unit(detail_id,seq,serial_code,status,note,in_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)",
                args);
        return db.queryForList(
                "SELECT unit_id FROM product_unit WHERE serial_code IN (" + marks(codes.size()) + ") ORDER BY unit_id",
                Integer.class,
                codes.toArray());
    }

    /**
     * Đóng tối đa {@code count} lỗi đang mở của biến thể (lỗi báo sớm nhất trước), theo cách hàng rời kho:
     * RETURNED (trả NCC), SOLD (bán), DISCARDED (mất / kiểm kê thiếu). Trả về số lỗi đã đóng.
     */
    public int closeDefects(int detail, int count, String defectStatus, String note) {
        if (count <= 0 || !usable()) return 0;
        var ids = db.queryForList(
                "SELECT unit_id FROM product_unit WHERE detail_id=? AND defect_status='OPEN'"
                        + " ORDER BY defect_at,unit_id LIMIT " + count,
                Integer.class,
                detail);
        if (ids.isEmpty()) return 0;
        String status = switch (defectStatus) {
            case "RETURNED" -> RETURNED_SUPPLIER;
            case "SOLD" -> SOLD;
            default -> LOST;
        };
        String text = note == null ? null : note.length() > 255 ? note.substring(0, 255) : note;
        db.update(
                "UPDATE product_unit SET status=?,product_location_id=NULL,out_at=CURRENT_TIMESTAMP,defect_status=?,"
                        + "defect_resolved_at=CURRENT_TIMESTAMP,defect_resolve_note=?,updated_at=CURRENT_TIMESTAMP"
                        + " WHERE defect_status='OPEN' AND unit_id IN (" + marks(ids.size()) + ")",
                concat(new Object[] {status, defectStatus, text}, ids));
        return ids.size();
    }

    /** Sau khi tồn giảm: số lỗi đang mở không được vượt tồn, phần dư đóng theo {@code defectStatus}. */
    public void clampDefects(int detail, String defectStatus, String note) {
        if (!usable()) return;
        var stock = db.queryForList("SELECT stock_quantity FROM product_detail WHERE detail_id=?", Integer.class, detail);
        if (stock.isEmpty()) return;
        int extra = openDefects(detail) - Math.max(0, stock.get(0) == null ? 0 : stock.get(0));
        closeDefects(detail, extra, defectStatus, note);
    }

    public static String marks(int n) {
        return String.join(",", Collections.nCopies(n, "?"));
    }

    public static Object[] concat(Object[] head, List<?> tail) {
        var all = new ArrayList<Object>(Arrays.asList(head));
        all.addAll(tail);
        return all.toArray();
    }
}

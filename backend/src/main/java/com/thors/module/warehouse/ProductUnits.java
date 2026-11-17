package com.thors.module.warehouse;

import java.util.*;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Serial của từng chiếc hàng (bảng product_unit, migration 2026-11-16_product_unit.sql).
 *
 * <p>Tồn kho vẫn tính theo số lượng (product_detail.stock_quantity, product_location.quantity); serial
 * là lớp đi kèm. Quy tắc giữ đúng: số serial IN_STOCK của một biến thể = stock_quantity, và số serial
 * IN_STOCK đang ở một ô kệ = product_location.quantity của ô đó (phần còn lại là "chưa xếp").
 * Mọi thao tác kho gọi {@link #sync} sau khi đổi số lượng; nơi ngoài kho đổi tồn (bán tại quầy, khách
 * trả) được đối chiếu ở lần sync kế tiếp. Không biết chiếc nào thì lấy chiếc nhập sớm nhất (FIFO).
 * Số thứ tự serial không bao giờ dùng lại; dòng không bao giờ bị xóa.
 *
 * <p>Database chưa chạy migration: mọi hàm ở đây không làm gì (kho vẫn chạy như cũ).
 */
public final class ProductUnits {
    public static final String PENDING = "PENDING",
            IN_STOCK = "IN_STOCK",
            SOLD = "SOLD",
            RETURNED_SUPPLIER = "RETURNED_SUPPLIER",
            LOST = "LOST",
            VOID = "VOID";

    /** Hàng rời kho: trạng thái mới, đơn bán / dòng phiếu trả NCC (nếu có), ghi chú. */
    public record Out(String status, Integer orderItem, Integer receiptItem, String note) {}

    /** Hàng xuất hiện thêm: dùng lại chiếc đã ra có trạng thái {@code revive} (mới nhất trước), thiếu thì sinh mã mới. */
    public record In(List<String> revive, Integer receiptItem, String note) {}

    /** Tồn đổi ở ngoài kho (bán tại quầy, khách trả hàng…): giảm → coi là đã bán, tăng → chiếc vừa bán quay lại. */
    public static final Out EXTERNAL_OUT = new Out(SOLD, null, null, "Xuất ngoài kho (tự đối chiếu theo tồn)");

    public static final In EXTERNAL_IN = new In(List.of(SOLD), null, "Nhập lại ngoài kho (tự đối chiếu theo tồn)");

    private final JdbcTemplate db;
    private volatile Boolean ready;
    private volatile long checkedAt;
    private volatile Boolean defectsReady;
    private volatile long defectsCheckedAt;

    public ProductUnits(JdbcTemplate db) {
        this.db = db;
    }

    /** Mã serial: mã biến thể TH + 6 số + "-" + số thứ tự 4 số, ví dụ TH000006-0001. */
    public static String serial(int detail, int seq) {
        return String.format(Locale.ROOT, "TH%06d-%04d", detail, seq);
    }

    /** Dạng mã serial (để phân biệt với mã biến thể khi quét). */
    public static boolean looksSerial(String code) {
        return code != null && code.matches("TH\\d{6,}-\\d{4,}");
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

    /** Chiếc đang báo lỗi của một biến thể. */
    private Set<Integer> openDefects(int detail) {
        if (!defectsReady()) return Set.of();
        return new HashSet<>(db.queryForList(
                "SELECT unit_id FROM product_unit WHERE detail_id=? AND defect_status='OPEN'", Integer.class, detail));
    }

    /** Đối chiếu khi không biết lý do (đọc danh sách mã, tra cứu, trước một thao tác kho). */
    public Map<String, Integer> sync(int detail) {
        return sync(detail, EXTERNAL_OUT, EXTERNAL_IN);
    }

    /**
     * Cho serial IN_STOCK của biến thể khớp số lượng hiện tại. Người gọi giữ khóa kho
     * ({@link WarehouseStore#lock()}). Chiếc thừa ở ô này chuyển sang ô đang thiếu (chuyển kệ, xếp kệ);
     * còn thừa thì rời kho theo {@code out}; còn thiếu thì nhập theo {@code in}.
     */
    public Map<String, Integer> sync(int detail, Out out, In in) {
        if (!ready()) return Map.of();
        var stockRows = db.queryForList("SELECT stock_quantity FROM product_detail WHERE detail_id=?", Integer.class, detail);
        if (stockRows.isEmpty()) return Map.of();
        int left = Math.max(0, stockRows.get(0) == null ? 0 : stockRows.get(0));
        // Số chiếc phải có ở từng ô (0 = chưa xếp). Dữ liệu lệch (tổng ô > tồn): ưu tiên ô nhiều hàng.
        var target = new LinkedHashMap<Integer, Integer>();
        for (var row : db.queryForList(
                "SELECT product_location_id,quantity FROM product_location WHERE detail_id=? AND quantity>0"
                        + " ORDER BY quantity DESC,product_location_id",
                detail)) {
            int q = Math.min(left, ((Number) row.get("quantity")).intValue());
            target.put(((Number) row.get("product_location_id")).intValue(), q);
            left -= q;
        }
        target.put(0, left);

        var current = new LinkedHashMap<Integer, List<Integer>>();
        for (var row : db.queryForList(
                "SELECT unit_id,product_location_id FROM product_unit WHERE detail_id=? AND status='IN_STOCK' ORDER BY unit_id",
                detail)) {
            Object loc = row.get("product_location_id");
            int key = loc == null ? 0 : ((Number) loc).intValue();
            if (!target.containsKey(key)) key = -key - 1; // ô không còn hàng: toàn bộ là thừa
            current.computeIfAbsent(key, k -> new ArrayList<>()).add(((Number) row.get("unit_id")).intValue());
        }

        // Thứ tự ưu tiên rời kho: trả NCC lấy chiếc lỗi trước; bán / mất lấy chiếc lành trước (chiếc lỗi ở lại
        // để xử lý). Cùng loại thì chiếc nhập sớm nhất trước.
        var defective = openDefects(detail);
        boolean defectsFirst = RETURNED_SUPPLIER.equals(out.status());
        Comparator<Integer> leaveFirst = Comparator.<Integer, Boolean>comparing(
                        id -> defective.contains(id) != defectsFirst)
                .thenComparing(Comparator.naturalOrder());

        // Thừa → gom lại; ô đang thiếu lấy từ cuối (chiếc ít nên rời kho nhất), phần còn lại rời kho
        var pool = new ArrayList<Integer>();
        for (var e : current.entrySet()) {
            int surplus = e.getValue().size() - target.getOrDefault(e.getKey(), 0);
            if (surplus > 0) pool.addAll(e.getValue().stream().sorted(leaveFirst).limit(surplus).toList());
        }
        pool.sort(leaveFirst);

        int moved = 0, created = 0, revived = 0;
        var need = new LinkedHashMap<Integer, Integer>();
        for (var e : target.entrySet()) {
            int deficit = e.getValue() - current.getOrDefault(e.getKey(), List.of()).size();
            if (deficit <= 0) continue;
            int take = Math.min(deficit, pool.size());
            var ids = new ArrayList<>(pool.subList(pool.size() - take, pool.size()));
            pool.subList(pool.size() - take, pool.size()).clear();
            place(ids, e.getKey());
            moved += take;
            if (deficit > take) need.put(e.getKey(), deficit - take);
        }

        if (!pool.isEmpty()) {
            for (var ids : chunks(pool))
                db.update(
                        "UPDATE product_unit SET status=?,product_location_id=NULL,out_order_item_id=?,out_receipt_item_id=?,"
                                + "note=?,out_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE unit_id IN ("
                                + marks(ids.size()) + ")",
                        concat(new Object[] {out.status(), out.orderItem(), out.receiptItem(), out.note()}, ids));
            closeDefects(pool, switch (out.status()) {
                case RETURNED_SUPPLIER -> "RETURNED";
                case SOLD -> "SOLD";
                default -> "DISCARDED";
            }, out.note());
        }

        for (var e : need.entrySet()) {
            int count = e.getValue();
            if (!in.revive().isEmpty()) {
                var back = db.queryForList(
                        "SELECT unit_id FROM product_unit WHERE detail_id=? AND status IN (" + marks(in.revive().size())
                                + ") ORDER BY out_at DESC,unit_id DESC LIMIT " + count,
                        Integer.class,
                        concat(new Object[] {detail}, in.revive()));
                for (var ids : chunks(back))
                    db.update(
                            "UPDATE product_unit SET status='IN_STOCK',product_location_id=?,out_order_item_id=NULL,"
                                    + "out_receipt_item_id=NULL,out_at=NULL,note=?,in_at=CURRENT_TIMESTAMP,"
                                    + "updated_at=CURRENT_TIMESTAMP WHERE unit_id IN (" + marks(ids.size()) + ")",
                            concat(new Object[] {e.getKey() == 0 ? null : e.getKey(), in.note()}, ids));
                revived += back.size();
                count -= back.size();
            }
            if (count > 0) {
                create(detail, count, IN_STOCK, e.getKey() == 0 ? null : e.getKey(), in.receiptItem(), in.note());
                created += count;
            }
        }
        return Map.of("moved", moved, "out", pool.size(), "revived", revived, "created", created);
    }

    /** Lỗi đang mở của các chiếc vừa rời kho được đóng theo cách chúng rời kho. */
    public void closeDefects(List<Integer> units, String status, String note) {
        if (units.isEmpty() || !defectsReady()) return;
        String text = note == null ? null : note.length() > 255 ? note.substring(0, 255) : note;
        for (var ids : chunks(units))
            db.update(
                    "UPDATE product_unit SET defect_status=?,defect_resolved_at=CURRENT_TIMESTAMP,defect_resolve_note=?"
                            + " WHERE defect_status='OPEN' AND unit_id IN (" + marks(ids.size()) + ")",
                    concat(new Object[] {status, text}, ids));
    }

    /** Sinh {@code count} serial mới cho biến thể; trả về mã đã sinh theo thứ tự. */
    public List<String> create(int detail, int count, String status, Integer location, Integer receiptItem, String note) {
        if (count <= 0) return List.of();
        int next = db.queryForObject("SELECT COALESCE(MAX(seq),0) FROM product_unit WHERE detail_id=?", Integer.class, detail) + 1;
        var codes = new ArrayList<String>(count);
        var args = new ArrayList<Object[]>(count);
        boolean in = IN_STOCK.equals(status);
        for (int i = 0; i < count; i++) {
            String code = serial(detail, next + i);
            codes.add(code);
            args.add(new Object[] {detail, next + i, code, status, location, receiptItem, note});
        }
        db.batchUpdate(
                "INSERT INTO product_unit(detail_id,seq,serial_code,status,product_location_id,in_receipt_item_id,note,in_at)"
                        + " VALUES(?,?,?,?,?,?,?," + (in ? "CURRENT_TIMESTAMP" : "NULL") + ")",
                args);
        return codes;
    }

    /**
     * Chốt nhận hàng một dòng phiếu nhập: {@code qty} chiếc vào kho (chưa xếp). Tem đã quét vào trước,
     * rồi đến tem đã in chưa quét (khi số đếm được nhập tay); tem in thừa bị hủy; thiếu tem thì sinh mã mới.
     */
    public void receive(int item, int detail, int qty) {
        if (!ready()) return;
        var ids = db.queryForList(
                "SELECT unit_id FROM product_unit WHERE in_receipt_item_id=? AND status='PENDING'"
                        + " ORDER BY CASE WHEN scanned_at IS NULL THEN 1 ELSE 0 END,unit_id",
                Integer.class,
                item);
        int take = Math.min(qty, ids.size());
        for (var chunk : chunks(ids.subList(0, take)))
            db.update(
                    "UPDATE product_unit SET status='IN_STOCK',product_location_id=NULL,in_at=CURRENT_TIMESTAMP,"
                            + "updated_at=CURRENT_TIMESTAMP WHERE unit_id IN (" + marks(chunk.size()) + ")",
                    chunk.toArray());
        voidPending(ids.subList(take, ids.size()), "Tem in thừa, không nhận khi kiểm hàng");
        if (qty > take) create(detail, qty - take, IN_STOCK, null, item, "Nhận theo phiếu nhập (không có tem in trước)");
    }

    /** Hủy mọi tem chưa nhận của một dòng phiếu nhập (phiếu bị hủy, dòng không nhận được gì). */
    public void voidPending(int item, String note) {
        if (!ready()) return;
        voidPending(
                db.queryForList(
                        "SELECT unit_id FROM product_unit WHERE in_receipt_item_id=? AND status='PENDING'", Integer.class, item),
                note);
    }

    private void voidPending(List<Integer> ids, String note) {
        for (var chunk : chunks(ids))
            db.update(
                    "UPDATE product_unit SET status='VOID',note=?,out_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP"
                            + " WHERE unit_id IN (" + marks(chunk.size()) + ")",
                    concat(new Object[] {note}, chunk));
    }

    private void place(List<Integer> ids, int location) {
        for (var chunk : chunks(ids))
            db.update(
                    "UPDATE product_unit SET product_location_id=?,updated_at=CURRENT_TIMESTAMP WHERE unit_id IN ("
                            + marks(chunk.size()) + ")",
                    concat(new Object[] {location == 0 ? null : location}, chunk));
    }

    static <T> List<List<T>> chunks(List<T> ids) {
        var out = new ArrayList<List<T>>();
        for (int i = 0; i < ids.size(); i += 500) out.add(ids.subList(i, Math.min(ids.size(), i + 500)));
        return out;
    }

    static String marks(int n) {
        return String.join(",", Collections.nCopies(n, "?"));
    }

    static Object[] concat(Object[] head, List<?> tail) {
        var all = new ArrayList<Object>(Arrays.asList(head));
        all.addAll(tail);
        return all.toArray();
    }
}

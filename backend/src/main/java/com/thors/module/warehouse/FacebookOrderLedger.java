package com.thors.module.warehouse;

import static com.thors.module.warehouse.WarehouseStore.num;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Thẻ kho cho đơn tạo từ màn hình Facebook. Code Facebook trừ thẳng product_detail.stock_quantity khi
 * tạo đơn nhưng không ghi stock_adjustment; lớp này chỉ GHI THÊM dòng "Xuất bán" (ORDER_OUT) cho
 * phần đã bị trừ đó và đánh dấu orders.stock_deducted_at để lúc Owner xác nhận đơn không trừ lần hai.
 * Không đổi tồn, không sửa dữ liệu đơn của code Facebook.
 *
 * <p>Chỉ ghi khi thấy tồn thật sự đã bị trừ mà chưa có thẻ kho (tồn − tổng thẻ kho ≤ −số lượng): câu
 * lệnh trừ của code Facebook có điều kiện {@code stock_quantity >= ?} nên có thể không trừ gì; khi đó
 * dòng đó để nguyên, Owner xác nhận đơn sẽ trừ và ghi thẻ kho như đơn online thường.
 *
 * <p>Từ 08/11/2026 màn hình Facebook không trừ kho khi chốt đơn nữa mà chỉ GIỮ hàng
 * (order_item.reserved_quantity &gt; 0); các dòng đang giữ được bỏ qua ở đây để không đoán nhầm "đã trừ"
 * khi dữ liệu cũ bị lệch giữa tồn và thẻ kho. Lớp này chỉ còn tác dụng với đơn kiểu cũ.
 */
@Service
public class FacebookOrderLedger {
    private static final Logger log = LoggerFactory.getLogger(FacebookOrderLedger.class);

    private final WarehouseStore s;
    private final TransactionTemplate tx;

    public FacebookOrderLedger(WarehouseStore s, PlatformTransactionManager transactions) {
        this.s = s;
        this.tx = new TransactionTemplate(transactions);
        // Giao dịch riêng: lỗi ở đây không bao giờ làm hủy giao dịch/đơn của code Facebook.
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    /** Ghi thẻ kho cho các dòng của đơn đã bị trừ tồn; trả về số dòng đã ghi. */
    public int record(int orderId) {
        Integer done = tx.execute(status -> {
            s.lock();
            var orders = s.jdbc()
                    .queryForList(
                            "SELECT order_number,COALESCE(created_by,user_id,1) AS actor,stock_deducted_at FROM orders"
                                    + " WHERE order_id=? FOR UPDATE",
                            orderId);
            if (orders.isEmpty() || orders.get(0).get("stock_deducted_at") != null) return 0;
            var order = orders.get(0);
            int actor = num(order, "actor");
            var lines = s.jdbc()
                    .queryForList(
                            """
                SELECT oi.order_item_id,oi.detail_id,oi.quantity FROM order_item oi WHERE oi.order_id=?
                  AND oi.reserved_quantity=0
                  AND NOT EXISTS (SELECT 1 FROM stock_adjustment m
                    WHERE m.order_item_id=oi.order_item_id AND m.movement_type='ORDER_OUT')
                ORDER BY oi.order_item_id
                """,
                            orderId);
            int recorded = 0;
            for (var line : lines) {
                int detail = num(line, "detail_id");
                int qty = num(line, "quantity");
                int item = num(line, "order_item_id");
                // Phần tồn đã bị trừ mà chưa có thẻ kho của biến thể này.
                long gap = s.count(
                        "SELECT d.stock_quantity-COALESCE((SELECT SUM(m.quantity_change) FROM stock_adjustment m"
                                + " WHERE m.detail_id=d.detail_id),0) FROM product_detail d WHERE d.detail_id=?",
                        detail);
                if (gap > -qty) {
                    log.warn("Đơn Facebook {} dòng #{}: tồn chưa bị trừ {} (lệch {}), để Owner xác nhận đơn trừ kho.",
                            order.get("order_number"), item, qty, gap);
                    continue;
                }
                s.recordSold(actor, detail, qty, item, "ORDER_OUT:FB:" + item,
                        "Xuất bán đơn Facebook " + order.get("order_number"));
                recorded++;
            }
            // Cả đơn đã trừ và có thẻ kho: đánh dấu để bước xác nhận đơn bỏ qua.
            if (recorded == lines.size() && recorded > 0)
                s.jdbc().update("UPDATE orders SET stock_deducted_at=CURRENT_TIMESTAMP WHERE order_id=? AND stock_deducted_at IS NULL",
                        orderId);
            return recorded;
        });
        return done == null ? 0 : done;
    }
}

package com.thors.module.order.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.order.dto.OrderViews.Detail;
import com.thors.module.order.dto.OrderViews.Page;
import com.thors.module.order.repository.OrderRepository;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class OrderService {
    private static final int MAX_SIZE = 50;

    /** Các vai trò xử lý đơn online của cửa hàng. */
    private static final Set<String> STORE_ROLES = Set.of("OWNER", "FAMILY_MEMBER");

    private final OrderRepository orders;

    public OrderService(OrderRepository orders) {
        this.orders = orders;
    }

    private static boolean isStore(Account actor) {
        return STORE_ROLES.contains(actor.role());
    }

    private static boolean isCustomer(Account actor) {
        return "CUSTOMER".equals(actor.role());
    }

    private static void requireOrderAccess(Account actor) {
        if (!isCustomer(actor) && !isStore(actor))
            throw new ApiException(403, "ROLE", "Vai trò này không được xem đơn hàng online.");
    }

    /**
     * View Order List: Customer thấy đơn của chính mình; Owner và Family Member thấy mọi đơn
     * online. Có lọc theo trạng thái, tìm theo mã đơn / tên / số điện thoại người nhận và phân trang.
     */
    public Page list(Account actor, String status, String q, int page, int size) {
        requireOrderAccess(actor);
        String safeStatus = blankToNull(status);
        String safeQuery = blankToNull(q);
        if (safeStatus != null && !OrderStatus.ALL.contains(safeStatus))
            throw new ApiException(400, "ORDER_STATUS", "Trạng thái đơn hàng không hợp lệ.");
        if (safeQuery != null && safeQuery.length() > 100)
            throw new ApiException(400, "QUERY", "Từ khóa tìm kiếm quá dài.");

        int safePage = Math.max(page, 0);
        int safeSize = Math.min(Math.max(size, 1), MAX_SIZE);
        Integer customerId = isCustomer(actor) ? actor.id() : null;

        var slice =
                orders.search(
                        customerId, OrderStatus.TYPE_ONLINE, safeStatus, safeQuery, safePage, safeSize);
        int totalPages = (int) Math.ceil(slice.total() / (double) safeSize);
        return new Page(slice.items(), safePage, safeSize, slice.total(), totalPages);
    }

    /**
     * View Order Detail: Customer chỉ xem đơn của mình (đơn của người khác trả 404 để không lộ đơn có
     * tồn tại); nhân viên cửa hàng xem mọi đơn online, kèm thông tin khách.
     */
    public Detail detail(Account actor, int orderId) {
        requireOrderAccess(actor);
        var found =
                orders.find(orderId, isStore(actor))
                        .filter(f -> OrderStatus.TYPE_ONLINE.equals(f.orderType()))
                        .filter(f -> !isCustomer(actor) || f.userId() == actor.id())
                        .orElseThrow(
                                () -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        return found.detail();
    }

    private static String blankToNull(String value) {
        if (value == null) return null;
        String s = value.trim();
        return s.isEmpty() ? null : s;
    }
}
package com.thors.module.order.delivery;

import com.thors.common.ApiException;
import com.thors.module.order.repository.OrderRepository;
import com.thors.security.SessionAccess;
import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Danh mục địa chỉ GHN theo địa giới mới 2 cấp cho form chọn Tỉnh / Phường-Xã. Cần đăng nhập. */
@RestController
@RequestMapping("/api/ghn")
public class GhnController {
    private static final Set<String> STORE_ROLES = Set.of("OWNER", "FAMILY_MEMBER");

    private final GhnClient ghn;
    private final OrderRepository orders;
    private final SessionAccess sessions;

    public GhnController(GhnClient ghn, OrderRepository orders, SessionAccess sessions) {
        this.ghn = ghn;
        this.orders = orders;
        this.sessions = sessions;
    }

    /** GET /api/ghn/provinces -> [{id, name}] (34 tỉnh/thành) */
    @GetMapping("/provinces")
    Object provinces() {
        sessions.current();
        return ghn.provinces();
    }

    /** GET /api/ghn/wards?provinceId=1000001 -> [{id, name}] (phường/xã/đặc khu của tỉnh) */
    @GetMapping("/wards")
    Object wards(@RequestParam int provinceId) {
        sessions.current();
        return ghn.wards(provinceId);
    }

    /** GET /api/ghn/suggest?orderId= -> {provinceId, wardId} đoán theo địa chỉ giao. Chỉ cửa hàng được dùng. */
    @GetMapping("/suggest")
    Object suggest(@RequestParam int orderId) {
        if (!STORE_ROLES.contains(sessions.current().role()))
            throw new ApiException(403, "ROLE", "Chỉ cửa hàng được dùng chức năng này.");
        var in =
                orders.findShipInput(orderId)
                        .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        return ghn.suggest(in.address());
    }
}

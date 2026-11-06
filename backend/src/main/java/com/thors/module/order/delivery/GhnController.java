package com.thors.module.order.delivery;

import com.thors.common.ApiException;
import com.thors.module.order.repository.OrderRepository;
import com.thors.security.SessionAccess;
import java.util.List;
import java.util.Set;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Danh mục địa chỉ theo GHN cho form chọn Tỉnh / Quận-Huyện / Phường-Xã. Cần đăng nhập. */
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

    /** GET /api/ghn/provinces -> [{id, name}] */
    @GetMapping("/provinces")
    Object provinces() {
        sessions.current();
        return ghn.provinces();
    }

    /** GET /api/ghn/districts?provinceId=201 -> [{id, name}] */
    @GetMapping("/districts")
    Object districts(@RequestParam int provinceId) {
        sessions.current();
        return ghn.districts(provinceId);
    }

    /** GET /api/ghn/wards?districtId=1809 -> [{id (WardCode), name}] */
    @GetMapping("/wards")
    Object wards(@RequestParam int districtId) {
        sessions.current();
        return ghn.wards(districtId);
    }

    /**
     * GET /api/ghn/suggest?orderId= -> {provinceId, districtId, wardCode, candidates}. Đơn đã lưu mã GHN
     * thì trả lại mã đó; chưa có thì đoán theo tên trong địa chỉ giao. Chỉ cửa hàng được dùng.
     */
    @GetMapping("/suggest")
    Object suggest(@RequestParam int orderId) {
        if (!STORE_ROLES.contains(sessions.current().role()))
            throw new ApiException(403, "ROLE", "Chỉ cửa hàng được dùng chức năng này.");
        var in =
                orders.findShipInput(orderId)
                        .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng."));
        GhnClient.Suggestion guess = ghn.suggest(in.address());
        if (in.districtId() != null && in.wardCode() != null) {
            String provinceId = findProvinceOf(in.districtId(), guess.provinceId());
            return new GhnClient.Suggestion(provinceId, String.valueOf(in.districtId()), in.wardCode(), List.of());
        }
        return guess;
    }

    /** Tìm tỉnh chứa quận/huyện đã lưu, thử tỉnh đoán được trước cho nhanh. */
    private String findProvinceOf(int districtId, String hint) {
        String id = String.valueOf(districtId);
        if (hint != null && ghn.districts(Integer.parseInt(hint)).stream().anyMatch(d -> d.id().equals(id)))
            return hint;
        for (var p : ghn.provinces())
            if (ghn.districts(Integer.parseInt(p.id())).stream().anyMatch(d -> d.id().equals(id))) return p.id();
        return null;
    }
}

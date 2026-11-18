package com.thors.module.fitting.controller;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.fitting.dto.BodyProfileRequest;
import com.thors.module.fitting.dto.SizeGuide;
import com.thors.module.fitting.service.SizeGuideService;
import com.thors.security.SessionAccess;
import org.springframework.web.bind.annotation.*;

/**
 * Gợi ý size trên trang sản phẩm của cửa hàng. Nằm dưới /api/shop/** nên khách vãng lai cũng gọi được;
 * khách đã đăng nhập và đã lưu số đo thì tự dùng số đo đó.
 */
@RestController
@RequestMapping("/api/shop/products/{productId}/size-guide")
public class ShopSizeGuideController {

    private final SizeGuideService service;
    private final SessionAccess sessions;

    public ShopSizeGuideController(SizeGuideService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    /** Bảng size + gợi ý theo số đo đã lưu (nếu có). */
    @GetMapping
    public SizeGuide get(@PathVariable int productId) {
        return service.guide(productId, currentOrNull(), null);
    }

    /** Gợi ý theo số đo gửi kèm (khách vãng lai, hoặc thử số đo khác). */
    @PostMapping
    public SizeGuide tryMeasurements(@PathVariable int productId, @RequestBody BodyProfileRequest body) {
        return service.guide(productId, currentOrNull(), body);
    }

    private Account currentOrNull() {
        try {
            return sessions.current();
        } catch (ApiException e) {
            return null; // chưa đăng nhập: vẫn xem được bảng size
        }
    }
}

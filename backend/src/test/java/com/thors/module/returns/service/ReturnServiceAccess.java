package com.thors.module.returns.service;

import com.thors.module.returns.dto.ReturnableOrderResponse;
import java.time.LocalDateTime;

/** Cho test ở package khác gọi quy tắc chặn trả hàng (hàm package-private của ReturnService). */
public final class ReturnServiceAccess {
    private ReturnServiceAccess() {}

    public static String block(ReturnableOrderResponse order, LocalDateTime nowUtc) {
        return ReturnService.customerReturnBlock(order, nowUtc);
    }
}

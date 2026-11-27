package com.thors.module.sales.service;

import org.springframework.dao.DuplicateKeyException;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.UUID;
import java.util.function.Function;

final class SaleNumbers {

    private static final ZoneId SHOP_ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    private SaleNumbers() {
    }

    static <T> T insertWithUniqueNumber(String prefix, Function<String, T> insert) {
        for (int attempt = 1; ; attempt++) {
            try {
                return insert.apply(prefix + "-" + LocalDate.now(SHOP_ZONE).format(DateTimeFormatter.BASIC_ISO_DATE) + "-"
                        + UUID.randomUUID().toString().replace("-", "").substring(0, 6).toUpperCase());
            } catch (DuplicateKeyException ex) {
                if (attempt == 3) {
                    throw ex;
                }
            }
        }
    }
}

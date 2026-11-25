package com.thors.module.sales.dto;

import java.util.List;

public record InStoreSalePageResponse(
        List<InStoreSaleListItem> items,
        long total,
        int totalPages
) {
}

package com.thors.module.sales.dto;

import java.util.List;

public record InStoreSalePageResponse(
        List<InStoreSaleListItem> items,
        int page,
        int size,
        long total,
        int totalPages
) {
}

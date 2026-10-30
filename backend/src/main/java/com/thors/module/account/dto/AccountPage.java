package com.thors.module.account.dto;

import java.util.List;

public record AccountPage(
        List<AccountView> items, int page, int size, long total, int totalPages) {}
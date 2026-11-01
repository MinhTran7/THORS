package com.thors.module.cart.dto;

import java.util.List;

public record DeleteCartItemsRequest(List<Integer> cartItemIds) {}
package com.thors.module.payment.dto;

import jakarta.validation.constraints.NotNull;

public class CreatePaymentLinkRequest {
    @NotNull(message = "orderId không được để trống")
    private Integer orderId;
    private String cancelUrl;
    private String returnUrl;

    public CreatePaymentLinkRequest() {}

    public CreatePaymentLinkRequest(Integer orderId, String cancelUrl, String returnUrl) {
        this.orderId = orderId;
        this.cancelUrl = cancelUrl;
        this.returnUrl = returnUrl;
    }

    public Integer getOrderId() {
        return orderId;
    }

    public void setOrderId(Integer orderId) {
        this.orderId = orderId;
    }

    public String getCancelUrl() {
        return cancelUrl;
    }

    public void setCancelUrl(String cancelUrl) {
        this.cancelUrl = cancelUrl;
    }

    public String getReturnUrl() {
        return returnUrl;
    }

    public void setReturnUrl(String returnUrl) {
        this.returnUrl = returnUrl;
    }
}


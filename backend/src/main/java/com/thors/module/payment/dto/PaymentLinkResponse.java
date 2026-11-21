package com.thors.module.payment.dto;

public class PaymentLinkResponse {
    private int orderId;
    private String orderNumber;
    private long orderCode;
    private long amount;
    private String checkoutUrl;
    private String qrCode;
    private String accountNumber;
    private String accountName;
    private String bin;
    private String status;
    // Số giây còn lại để thanh toán (null = đơn không có hạn giữ)
    private Long expiresInSeconds;

    public Long getExpiresInSeconds() { return expiresInSeconds; }
    public void setExpiresInSeconds(Long expiresInSeconds) { this.expiresInSeconds = expiresInSeconds; }

    public PaymentLinkResponse() {}

    public PaymentLinkResponse(
            int orderId,
            String orderNumber,
            long orderCode,
            long amount,
            String checkoutUrl,
            String qrCode,
            String accountNumber,
            String accountName,
            String bin,
            String status) {
        this.orderId = orderId;
        this.orderNumber = orderNumber;
        this.orderCode = orderCode;
        this.amount = amount;
        this.checkoutUrl = checkoutUrl;
        this.qrCode = qrCode;
        this.accountNumber = accountNumber;
        this.accountName = accountName;
        this.bin = bin;
        this.status = status;
    }

    public int getOrderId() { return orderId; }
    public void setOrderId(int orderId) { this.orderId = orderId; }

    public String getOrderNumber() { return orderNumber; }
    public void setOrderNumber(String orderNumber) { this.orderNumber = orderNumber; }

    public long getOrderCode() { return orderCode; }
    public void setOrderCode(long orderCode) { this.orderCode = orderCode; }

    public long getAmount() { return amount; }
    public void setAmount(long amount) { this.amount = amount; }

    public String getCheckoutUrl() { return checkoutUrl; }
    public void setCheckoutUrl(String checkoutUrl) { this.checkoutUrl = checkoutUrl; }

    public String getQrCode() { return qrCode; }
    public void setQrCode(String qrCode) { this.qrCode = qrCode; }

    public String getAccountNumber() { return accountNumber; }
    public void setAccountNumber(String accountNumber) { this.accountNumber = accountNumber; }

    public String getAccountName() { return accountName; }
    public void setAccountName(String accountName) { this.accountName = accountName; }

    public String getBin() { return bin; }
    public void setBin(String bin) { this.bin = bin; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
}


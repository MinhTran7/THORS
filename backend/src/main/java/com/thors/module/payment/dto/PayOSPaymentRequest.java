package com.thors.module.payment.dto;

import java.util.List;

public class PayOSPaymentRequest {
    private long orderCode;
    private long amount;
    private String description;
    private String buyerName;
    private String buyerEmail;
    private String buyerPhone;
    private String buyerAddress;
    private List<Item> items;
    private String cancelUrl;
    private String returnUrl;
    private String signature;
    // Hạn của link (unix giây). Không nằm trong chữ ký; null = không gửi (link theo hạn mặc định của PayOS)
    @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
    private Long expiredAt;

    public Long getExpiredAt() { return expiredAt; }
    public void setExpiredAt(Long expiredAt) { this.expiredAt = expiredAt; }

    public static class Item {
        private String name;
        private int quantity;
        private long price;

        public Item() {}

        public Item(String name, int quantity, long price) {
            this.name = name;
            this.quantity = quantity;
            this.price = price;
        }

        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public int getQuantity() { return quantity; }
        public void setQuantity(int quantity) { this.quantity = quantity; }
        public long getPrice() { return price; }
        public void setPrice(long price) { this.price = price; }
    }

    public long getOrderCode() { return orderCode; }
    public void setOrderCode(long orderCode) { this.orderCode = orderCode; }

    public long getAmount() { return amount; }
    public void setAmount(long amount) { this.amount = amount; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getBuyerName() { return buyerName; }
    public void setBuyerName(String buyerName) { this.buyerName = buyerName; }

    public String getBuyerEmail() { return buyerEmail; }
    public void setBuyerEmail(String buyerEmail) { this.buyerEmail = buyerEmail; }

    public String getBuyerPhone() { return buyerPhone; }
    public void setBuyerPhone(String buyerPhone) { this.buyerPhone = buyerPhone; }

    public String getBuyerAddress() { return buyerAddress; }
    public void setBuyerAddress(String buyerAddress) { this.buyerAddress = buyerAddress; }

    public List<Item> getItems() { return items; }
    public void setItems(List<Item> items) { this.items = items; }

    public String getCancelUrl() { return cancelUrl; }
    public void setCancelUrl(String cancelUrl) { this.cancelUrl = cancelUrl; }

    public String getReturnUrl() { return returnUrl; }
    public void setReturnUrl(String returnUrl) { this.returnUrl = returnUrl; }

    public String getSignature() { return signature; }
    public void setSignature(String signature) { this.signature = signature; }
}


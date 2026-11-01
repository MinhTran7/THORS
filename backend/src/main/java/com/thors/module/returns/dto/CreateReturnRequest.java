package com.thors.module.returns.dto;

import java.math.BigDecimal;
import java.util.List;

public class CreateReturnRequest {

    private String orderNumber;
    private String customerName;
    private String customerPhone;
    private String reason;
    private String requestType = "RETURN"; // RETURN or EXCHANGE
    private boolean instantComplete; // If true, immediately inspect, restock & complete (In-store return)
    private String bankCode;
    private String bankAccountNumber;
    private String bankAccountName;
    private BigDecimal returnShippingFee;
    private String returnShippingPayer = "CUSTOMER"; // CUSTOMER or SHOP
    private String returnTrackingCode;
    private String evidenceUrls;
    private List<ItemRequest> items;

    public static class ItemRequest {
        private Integer orderItemId;
        private Integer quantityReturned;
        private String itemReason;
        private Integer quantityReceived;
        private Integer quantityRestocked;
        private BigDecimal refundAmount;

        public Integer getOrderItemId() {
            return orderItemId;
        }

        public void setOrderItemId(Integer orderItemId) {
            this.orderItemId = orderItemId;
        }

        public Integer getQuantityReturned() {
            return quantityReturned;
        }

        public void setQuantityReturned(Integer quantityReturned) {
            this.quantityReturned = quantityReturned;
        }

        public String getItemReason() {
            return itemReason;
        }

        public void setItemReason(String itemReason) {
            this.itemReason = itemReason;
        }

        public Integer getQuantityReceived() {
            return quantityReceived;
        }

        public void setQuantityReceived(Integer quantityReceived) {
            this.quantityReceived = quantityReceived;
        }

        public Integer getQuantityRestocked() {
            return quantityRestocked;
        }

        public void setQuantityRestocked(Integer quantityRestocked) {
            this.quantityRestocked = quantityRestocked;
        }

        public BigDecimal getRefundAmount() {
            return refundAmount;
        }

        public void setRefundAmount(BigDecimal refundAmount) {
            this.refundAmount = refundAmount;
        }
    }

    public String getOrderNumber() {
        return orderNumber;
    }

    public void setOrderNumber(String orderNumber) {
        this.orderNumber = orderNumber;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = customerName;
    }

    public String getCustomerPhone() {
        return customerPhone;
    }

    public void setCustomerPhone(String customerPhone) {
        this.customerPhone = customerPhone;
    }

    public String getReason() {
        return reason;
    }

    public void setReason(String reason) {
        this.reason = reason;
    }

    public String getRequestType() {
        return requestType;
    }

    public void setRequestType(String requestType) {
        this.requestType = requestType;
    }

    public boolean isInstantComplete() {
        return instantComplete;
    }

    public void setInstantComplete(boolean instantComplete) {
        this.instantComplete = instantComplete;
    }

    public String getBankCode() {
        return bankCode;
    }

    public void setBankCode(String bankCode) {
        this.bankCode = bankCode;
    }

    public String getBankAccountNumber() {
        return bankAccountNumber;
    }

    public void setBankAccountNumber(String bankAccountNumber) {
        this.bankAccountNumber = bankAccountNumber;
    }

    public String getBankAccountName() {
        return bankAccountName;
    }

    public void setBankAccountName(String bankAccountName) {
        this.bankAccountName = bankAccountName;
    }

    public BigDecimal getReturnShippingFee() {
        return returnShippingFee;
    }

    public void setReturnShippingFee(BigDecimal returnShippingFee) {
        this.returnShippingFee = returnShippingFee;
    }

    public String getReturnShippingPayer() {
        return returnShippingPayer;
    }

    public void setReturnShippingPayer(String returnShippingPayer) {
        this.returnShippingPayer = returnShippingPayer;
    }

    public String getReturnTrackingCode() {
        return returnTrackingCode;
    }

    public void setReturnTrackingCode(String returnTrackingCode) {
        this.returnTrackingCode = returnTrackingCode;
    }

    public String getEvidenceUrls() {
        return evidenceUrls;
    }

    public void setEvidenceUrls(String evidenceUrls) {
        this.evidenceUrls = evidenceUrls;
    }

    public List<ItemRequest> getItems() {
        return items;
    }

    public void setItems(List<ItemRequest> items) {
        this.items = items;
    }
}

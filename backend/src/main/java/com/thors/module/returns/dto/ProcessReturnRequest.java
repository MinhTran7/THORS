package com.thors.module.returns.dto;

import java.math.BigDecimal;
import java.util.List;

public class ProcessReturnRequest {

    private String action; // APPROVE, REJECT, RECEIVE, COMPLETE
    private String note;
    private BigDecimal returnShippingFee;
    private String returnShippingPayer;
    private String returnTrackingCode;
    private List<ProcessItemRequest> items;

    public static class ProcessItemRequest {
        private Integer returnRequestItemId;
        private Integer quantityReceived;
        private Integer quantityRestocked;
        private BigDecimal refundAmount;

        public Integer getReturnRequestItemId() {
            return returnRequestItemId;
        }

        public void setReturnRequestItemId(Integer returnRequestItemId) {
            this.returnRequestItemId = returnRequestItemId;
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

    public String getAction() {
        return action;
    }

    public void setAction(String action) {
        this.action = action;
    }

    public String getNote() {
        return note;
    }

    public void setNote(String note) {
        this.note = note;
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

    public List<ProcessItemRequest> getItems() {
        return items;
    }

    public void setItems(List<ProcessItemRequest> items) {
        this.items = items;
    }
}


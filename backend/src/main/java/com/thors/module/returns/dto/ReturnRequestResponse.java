package com.thors.module.returns.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public class ReturnRequestResponse {

    private int returnRequestId;
    private int orderId;
    private String orderNumber;
    private Integer userId;
    private String customerName;
    private String customerPhone;
    private String reason;
    private String status;
    private String requestType;
    private LocalDateTime requestedAt;
    private LocalDateTime processedAt;
    private int createdBy;
    private String createdByName;
    private Integer processedBy;
    private String processedByName;
    private BigDecimal totalRefundAmount;
    private List<ItemDetail> items;

    public static class ItemDetail {
        private int returnRequestItemId;
        private int orderItemId;
        private int detailId;
        private String productName;
        private String size;
        private String color;
        private BigDecimal unitPrice;
        private int quantityPurchased;
        private int quantityReturned;
        private String itemReason;
        private int quantityReceived;
        private int quantityRestocked;
        private BigDecimal refundAmount;

        public int getReturnRequestItemId() {
            return returnRequestItemId;
        }

        public void setReturnRequestItemId(int returnRequestItemId) {
            this.returnRequestItemId = returnRequestItemId;
        }

        public int getOrderItemId() {
            return orderItemId;
        }

        public void setOrderItemId(int orderItemId) {
            this.orderItemId = orderItemId;
        }

        public int getDetailId() {
            return detailId;
        }

        public void setDetailId(int detailId) {
            this.detailId = detailId;
        }

        public String getProductName() {
            return productName;
        }

        public void setProductName(String productName) {
            this.productName = productName;
        }

        public String getSize() {
            return size;
        }

        public void setSize(String size) {
            this.size = size;
        }

        public String getColor() {
            return color;
        }

        public void setColor(String color) {
            this.color = color;
        }

        public BigDecimal getUnitPrice() {
            return unitPrice;
        }

        public void setUnitPrice(BigDecimal unitPrice) {
            this.unitPrice = unitPrice;
        }

        public int getQuantityPurchased() {
            return quantityPurchased;
        }

        public void setQuantityPurchased(int quantityPurchased) {
            this.quantityPurchased = quantityPurchased;
        }

        public int getQuantityReturned() {
            return quantityReturned;
        }

        public void setQuantityReturned(int quantityReturned) {
            this.quantityReturned = quantityReturned;
        }

        public String getItemReason() {
            return itemReason;
        }

        public void setItemReason(String itemReason) {
            this.itemReason = itemReason;
        }

        public int getQuantityReceived() {
            return quantityReceived;
        }

        public void setQuantityReceived(int quantityReceived) {
            this.quantityReceived = quantityReceived;
        }

        public int getQuantityRestocked() {
            return quantityRestocked;
        }

        public void setQuantityRestocked(int quantityRestocked) {
            this.quantityRestocked = quantityRestocked;
        }

        public BigDecimal getRefundAmount() {
            return refundAmount;
        }

        public void setRefundAmount(BigDecimal refundAmount) {
            this.refundAmount = refundAmount;
        }
    }

    public int getReturnRequestId() {
        return returnRequestId;
    }

    public void setReturnRequestId(int returnRequestId) {
        this.returnRequestId = returnRequestId;
    }

    public int getOrderId() {
        return orderId;
    }

    public void setOrderId(int orderId) {
        this.orderId = orderId;
    }

    public String getOrderNumber() {
        return orderNumber;
    }

    public void setOrderNumber(String orderNumber) {
        this.orderNumber = orderNumber;
    }

    public Integer getUserId() {
        return userId;
    }

    public void setUserId(Integer userId) {
        this.userId = userId;
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

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getRequestType() {
        return requestType;
    }

    public void setRequestType(String requestType) {
        this.requestType = requestType;
    }

    public LocalDateTime getRequestedAt() {
        return requestedAt;
    }

    public void setRequestedAt(LocalDateTime requestedAt) {
        this.requestedAt = requestedAt;
    }

    public LocalDateTime getProcessedAt() {
        return processedAt;
    }

    public void setProcessedAt(LocalDateTime processedAt) {
        this.processedAt = processedAt;
    }

    public int getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(int createdBy) {
        this.createdBy = createdBy;
    }

    public String getCreatedByName() {
        return createdByName;
    }

    public void setCreatedByName(String createdByName) {
        this.createdByName = createdByName;
    }

    public Integer getProcessedBy() {
        return processedBy;
    }

    public void setProcessedBy(Integer processedBy) {
        this.processedBy = processedBy;
    }

    public String getProcessedByName() {
        return processedByName;
    }

    public void setProcessedByName(String processedByName) {
        this.processedByName = processedByName;
    }

    public BigDecimal getTotalRefundAmount() {
        return totalRefundAmount;
    }

    public void setTotalRefundAmount(BigDecimal totalRefundAmount) {
        this.totalRefundAmount = totalRefundAmount;
    }

    public List<ItemDetail> getItems() {
        return items;
    }

    public void setItems(List<ItemDetail> items) {
        this.items = items;
    }
}


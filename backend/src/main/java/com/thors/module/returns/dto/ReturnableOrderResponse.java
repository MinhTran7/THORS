package com.thors.module.returns.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public class ReturnableOrderResponse {

    private int orderId;
    private String orderNumber;
    private String orderStatus;
    private String paymentStatus;
    private String customerName;
    private String customerPhone;
    private LocalDateTime orderDate;
    private BigDecimal totalAmount;
    private List<OrderItemDetail> items;

    public static class OrderItemDetail {
        private int orderItemId;
        private int detailId;
        private String productName;
        private String size;
        private String color;
        private BigDecimal unitPrice;
        private int quantityPurchased;
        private int quantityReturnedSoFar;
        private int quantityReturnable;

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

        public int getQuantityReturnedSoFar() {
            return quantityReturnedSoFar;
        }

        public void setQuantityReturnedSoFar(int quantityReturnedSoFar) {
            this.quantityReturnedSoFar = quantityReturnedSoFar;
        }

        public int getQuantityReturnable() {
            return quantityReturnable;
        }

        public void setQuantityReturnable(int quantityReturnable) {
            this.quantityReturnable = quantityReturnable;
        }
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

    public String getOrderStatus() {
        return orderStatus;
    }

    public void setOrderStatus(String orderStatus) {
        this.orderStatus = orderStatus;
    }

    public String getPaymentStatus() {
        return paymentStatus;
    }

    public void setPaymentStatus(String paymentStatus) {
        this.paymentStatus = paymentStatus;
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

    public LocalDateTime getOrderDate() {
        return orderDate;
    }

    public void setOrderDate(LocalDateTime orderDate) {
        this.orderDate = orderDate;
    }

    public BigDecimal getTotalAmount() {
        return totalAmount;
    }

    public void setTotalAmount(BigDecimal totalAmount) {
        this.totalAmount = totalAmount;
    }

    public List<OrderItemDetail> getItems() {
        return items;
    }

    public void setItems(List<OrderItemDetail> items) {
        this.items = items;
    }
}


package com.thors.module.notification.service;

/** Giá trị cột notification.type và notification.related_entity_type đang dùng. */
public final class NotificationTypes {
    private NotificationTypes() {}

    // notification.type
    public static final String ACCOUNT_SECURITY = "ACCOUNT_SECURITY";
    public static final String PASSWORD_RESET_REQUEST = "PASSWORD_RESET_REQUEST";
    public static final String ORDER_STATUS = "ORDER_STATUS";
    public static final String PROMOTION = "PROMOTION";

    /**
     * Các loại người dùng được tự tắt. Thông báo đơn hàng và bảo mật tài khoản luôn gửi, không cho tắt.
     */
    public static final java.util.Set<String> MUTABLE = java.util.Set.of(PROMOTION);

    // notification.related_entity_type
    public static final String ENTITY_USER = "USER";
    public static final String ENTITY_ORDER = "ORDER";
    public static final String ENTITY_PROMOTION = "PROMOTION";
}
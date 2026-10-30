# Từ điển schema — 29 bảng

Tự động tổng hợp từ `database/SQL_v1.sql` tại checkpoint 28/10/2026. Chỉ trích CREATE TABLE, không chứa dữ liệu INSERT hoặc thông tin đăng nhập thật. Các tên/kiểu/default/comment bên dưới phản ánh dump, không khẳng định schema online chưa thay đổi.

Xem [DATABASE.md](DATABASE.md) để hiểu quan hệ và hai chênh lệch SUPPLIER_RETURN. Cột định nghĩa giữ nguyên comment/default trong SQL; dấu gạch đứng được escape để bảng Markdown hiển thị đúng.

## Mục lục

- [audit_log](#audit_log)
- [cart](#cart)
- [cart_item](#cart_item)
- [category](#category)
- [discount_code](#discount_code)
- [image_search](#image_search)
- [invoice](#invoice)
- [notification](#notification)
- [order_item](#order_item)
- [orders](#orders)
- [payment](#payment)
- [product](#product)
- [product_detail](#product_detail)
- [product_image](#product_image)
- [product_location](#product_location)
- [product_location_image](#product_location_image)
- [promotion](#promotion)
- [rack](#rack)
- [return_request](#return_request)
- [return_request_item](#return_request_item)
- [role](#role)
- [shelf_level](#shelf_level)
- [shift_change_request](#shift_change_request)
- [stock_adjustment](#stock_adjustment)
- [stock_receipt](#stock_receipt)
- [stock_receipt_item](#stock_receipt_item)
- [user](#user)
- [user_notification](#user_notification)
- [work_shift](#work_shift)

## audit_log

Nhật ký; đồng thời lưu liên kết OAuth, người tạo tài khoản và dấu thu hồi phiên.

| Cột | Định nghĩa trong dump |
|---|---|
| `log_id` | bigint NOT NULL AUTO_INCREMENT COMMENT 'Bảng log lớn nhanh nên dùng BIGINT' |
| `user_id` | int DEFAULT NULL COMMENT 'NULL khi tác nhân là job hoặc callback hệ thống' |
| `action_type` | varchar(50) NOT NULL |
| `entity_affected` | varchar(100) NOT NULL |
| `old_value` | text |
| `new_value` | text |
| `performed_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `entity_id` | bigint DEFAULT NULL COMMENT 'ID bản ghi bị tác động' |
| `actor_type` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'USER / SYSTEM' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`log_id`)
KEY `ix_audit_log_1` (`entity_affected`,`entity_id`,`performed_at`)
KEY `ix_audit_log_2` (`user_id`,`performed_at`)
CONSTRAINT `fk_audit_log_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
CONSTRAINT `ck_audit_log_1` CHECK ((`actor_type` in (_utf8mb4'USER',_utf8mb4'SYSTEM')))
```

## cart

Giỏ hàng của user; chưa có module giỏ trong source hiện tại.

| Cột | Định nghĩa trong dump |
|---|---|
| `cart_id` | int NOT NULL AUTO_INCREMENT |
| `user_id` | int NOT NULL |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`cart_id`)
UNIQUE KEY `uq_cart_1` (`user_id`)
CONSTRAINT `fk_cart_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
```

## cart_item

Dòng biến thể/số lượng trong giỏ.

| Cột | Định nghĩa trong dump |
|---|---|
| `cart_item_id` | int NOT NULL AUTO_INCREMENT |
| `cart_id` | int NOT NULL |
| `detail_id` | int NOT NULL COMMENT 'UNIQUE (cart_id, detail_id)' |
| `quantity` | int NOT NULL COMMENT 'Giá lấy trực tiếp từ product_detail.price' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`cart_item_id`)
UNIQUE KEY `uq_cart_item_1` (`cart_id`,`detail_id`)
KEY `fk_cart_item_detail_id` (`detail_id`)
CONSTRAINT `fk_cart_item_cart_id` FOREIGN KEY (`cart_id`) REFERENCES `cart` (`cart_id`)
CONSTRAINT `fk_cart_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`)
CONSTRAINT `ck_cart_item_1` CHECK ((`quantity` > 0))
```

## category

Danh mục sản phẩm.

| Cột | Định nghĩa trong dump |
|---|---|
| `category_id` | int NOT NULL AUTO_INCREMENT |
| `category_name` | varchar(100) NOT NULL |
| `description` | varchar(255) DEFAULT NULL |
| `status` | varchar(20) NOT NULL |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`category_id`)
UNIQUE KEY `uq_category_1` (`category_name`)
```

## discount_code

Mã giảm giá, điều kiện và giới hạn sử dụng; mới có schema.

| Cột | Định nghĩa trong dump |
|---|---|
| `discount_code_id` | int NOT NULL AUTO_INCREMENT |
| `code` | varchar(30) NOT NULL |
| `discount_percentage` | decimal(5,2) NOT NULL |
| `min_order_value` | decimal(12,0) NOT NULL DEFAULT '0' |
| `max_discount_amount` | decimal(12,0) DEFAULT NULL |
| `start_date` | date NOT NULL |
| `end_date` | date NOT NULL |
| `usage_limit` | int DEFAULT NULL COMMENT 'NULL = không giới hạn' |
| `used_count` | int NOT NULL DEFAULT '0' |
| `status` | varchar(20) NOT NULL |
| `created_by` | int NOT NULL COMMENT 'Owner tạo; giữ lịch sử người thao tác' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`discount_code_id`)
UNIQUE KEY `uq_discount_code_1` (`code`)
KEY `fk_discount_code_created_by` (`created_by`)
CONSTRAINT `fk_discount_code_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `ck_discount_code_1` CHECK ((`discount_percentage` between 0 and 100))
CONSTRAINT `ck_discount_code_2` CHECK ((`end_date` > `start_date`))
CONSTRAINT `ck_discount_code_3` CHECK ((`min_order_value` >= 0))
CONSTRAINT `ck_discount_code_4` CHECK (((`max_discount_amount` is null) or (`max_discount_amount` >= 0)))
CONSTRAINT `ck_discount_code_5` CHECK (((`usage_limit` is null) or (`usage_limit` > 0)))
CONSTRAINT `ck_discount_code_6` CHECK ((`used_count` >= 0))
CONSTRAINT `ck_discount_code_7` CHECK (((`usage_limit` is null) or (`used_count` <= `usage_limit`)))
```

## image_search

Lịch sử tìm bằng ảnh/model; chưa có pipeline AI trong source.

| Cột | Định nghĩa trong dump |
|---|---|
| `search_id` | int NOT NULL AUTO_INCREMENT |
| `user_id` | int DEFAULT NULL COMMENT 'NULL cho Guest; Admin bị chặn ở backend' |
| `image_url` | varchar(500) NOT NULL |
| `selected_product_id` | int DEFAULT NULL COMMENT 'NULL nếu người dùng không chọn sản phẩm nào' |
| `searched_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `image_public_id` | varchar(255) DEFAULT NULL COMMENT 'Định danh ảnh truy vấn nếu lưu trên cloud' |
| `model_version` | varchar(100) NOT NULL COMMENT 'Phiên bản mô hình và cách tính score' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`search_id`)
KEY `ix_image_search_1` (`user_id`,`searched_at`)
KEY `fk_image_search_selected_product_id` (`selected_product_id`)
CONSTRAINT `fk_image_search_selected_product_id` FOREIGN KEY (`selected_product_id`) REFERENCES `product` (`product_id`)
CONSTRAINT `fk_image_search_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
```

## invoice

Hóa đơn gắn đơn bán; chưa có module xuất hóa đơn.

| Cột | Định nghĩa trong dump |
|---|---|
| `invoice_id` | int NOT NULL AUTO_INCREMENT |
| `order_id` | int NOT NULL COMMENT 'Quan hệ 1-1 với đơn hàng' |
| `invoice_number` | varchar(30) NOT NULL COMMENT 'Index (tra cứu theo mã)' |
| `issued_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `issued_by` | int DEFAULT NULL COMMENT 'NULL nếu hệ thống phát hành; Staff chỉ tạo cho giao dịch tại quầy theo quyền' |
| `issuer_type` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'USER / SYSTEM' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`invoice_id`)
UNIQUE KEY `uq_invoice_1` (`order_id`)
UNIQUE KEY `uq_invoice_2` (`invoice_number`)
KEY `fk_invoice_issued_by` (`issued_by`)
CONSTRAINT `fk_invoice_issued_by` FOREIGN KEY (`issued_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `fk_invoice_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`)
CONSTRAINT `ck_invoice_1` CHECK ((`issuer_type` in (_utf8mb4'USER',_utf8mb4'SYSTEM')))
```

## notification

Nội dung thông báo, được kho sử dụng.

| Cột | Định nghĩa trong dump |
|---|---|
| `notification_id` | int NOT NULL AUTO_INCREMENT |
| `title` | varchar(200) NOT NULL |
| `message` | text NOT NULL |
| `type` | varchar(30) NOT NULL |
| `related_entity_type` | varchar(50) DEFAULT NULL |
| `related_entity_id` | int DEFAULT NULL |
| `created_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`notification_id`)
KEY `ix_notification_1` (`created_at`)
```

## order_item

Dòng đơn bán với snapshot sản phẩm/giá và reserved_quantity.

| Cột | Định nghĩa trong dump |
|---|---|
| `order_item_id` | int NOT NULL AUTO_INCREMENT |
| `order_id` | int NOT NULL |
| `detail_id` | int NOT NULL |
| `quantity` | int NOT NULL |
| `unit_price` | decimal(12,0) NOT NULL COMMENT 'Chốt giá tại thời điểm mua; thành tiền = quantity × unit_price' |
| `product_name_snapshot` | varchar(200) NOT NULL COMMENT 'Tên tại lúc đặt; không đổi khi sản phẩm đổi tên' |
| `size_snapshot` | varchar(10) NOT NULL |
| `color_snapshot` | varchar(30) NOT NULL |
| `reserved_quantity` | int NOT NULL DEFAULT '0' COMMENT 'Lượng giữ cho dòng đơn; đóng giữ phải về 0 cùng transaction' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`order_item_id`)
KEY `fk_order_item_order_id` (`order_id`)
KEY `fk_order_item_detail_id` (`detail_id`)
CONSTRAINT `fk_order_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`)
CONSTRAINT `fk_order_item_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`)
CONSTRAINT `ck_order_item_1` CHECK ((`quantity` > 0))
CONSTRAINT `ck_order_item_2` CHECK ((`unit_price` >= 0))
CONSTRAINT `ck_order_item_3` CHECK ((`reserved_quantity` between 0 and `quantity`))
```

## orders

Đơn bán online/tại quầy, trạng thái, giữ hàng, thanh toán và shipment; mới có schema.

| Cột | Định nghĩa trong dump |
|---|---|
| `order_id` | int NOT NULL AUTO_INCREMENT |
| `order_number` | varchar(30) NOT NULL COMMENT 'Index (tra cứu theo mã)' |
| `order_type` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Loại đơn: Online hoặc In-Store (bán tại quầy)' |
| `user_id` | int NOT NULL COMMENT 'Online: khách đặt đơn. In-Store: người bán tạo đơn; Owner vẫn phải xác nhận.' |
| `discount_code_id` | int DEFAULT NULL COMMENT 'Chỉ áp dụng cho đơn online; đơn tại quầy để NULL' |
| `promotion_id` | int DEFAULT NULL COMMENT 'Chỉ áp dụng cho đơn online; đơn tại quầy để NULL' |
| `delivery_name` | varchar(100) DEFAULT NULL COMMENT 'Đơn tại quầy có thể để trống' |
| `delivery_phone` | varchar(15) DEFAULT NULL |
| `delivery_address` | varchar(255) DEFAULT NULL |
| `order_date` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `order_status` | varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'AWAITING_PAYMENT / PENDING_CONFIRMATION / AWAITING_PICKUP / SHIPPING / DELIVERED / COMPLETED / CANCELLED / REJECTED / EXPIRED' |
| `payment_expires_at` | datetime DEFAULT NULL COMMENT 'Hạn trả tiền online; hạn giữ tạm ở stock_hold_expires_at, PAID không tự hết hạn.' |
| `total_amount` | decimal(12,0) NOT NULL |
| `created_by` | int NOT NULL COMMENT 'Online: khách hàng; tại quầy: Owner/Family/Staff theo quyền bán hàng' |
| `confirmed_by` | int DEFAULT NULL COMMENT 'Chỉ OWNER được xác nhận cả đơn online và tại quầy' |
| `confirmed_at` | datetime DEFAULT NULL COMMENT 'Mốc xác nhận thành công' |
| `stock_deducted_at` | datetime DEFAULT NULL COMMENT 'Đánh dấu đã trừ tồn; không trừ lần hai khi đổi trạng thái hoặc callback' |
| `preparation_status` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'NOT_STARTED' COMMENT 'NOT_STARTED / PREPARING / PREPARED; thao tác đơn online do Owner thực hiện' |
| `payment_method` | varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'CASH / COD / ONLINE; độc lập với trạng thái xử lý đơn' |
| `payment_status` | varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'UNPAID / PAID / REFUND_PENDING / PARTIALLY_REFUNDED / REFUNDED / NOT_REQUIRED' |
| `items_amount` | decimal(12,0) NOT NULL COMMENT 'Tổng quantity × unit_price tại lúc đặt' |
| `promotion_discount_amount` | decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Số tiền khuyến mãi thực tế đã chốt' |
| `coupon_discount_amount` | decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Số tiền mã giảm giá thực tế đã chốt' |
| `manual_discount_amount` | decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Giảm giá trực tiếp tại quầy, tính bằng VNĐ' |
| `shipping_fee` | decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Phí khách trả; tại quầy bằng 0' |
| `coupon_code_snapshot` | varchar(30) DEFAULT NULL COMMENT 'Mã đã áp dụng, giữ khi mã gốc đổi' |
| `promotion_name_snapshot` | varchar(100) DEFAULT NULL COMMENT 'Tên khuyến mãi đã áp dụng' |
| `cancel_reason` | varchar(255) DEFAULT NULL COMMENT 'Hủy, từ chối, hết hạn hoặc thiếu hàng khi xác nhận' |
| `cancelled_at` | datetime DEFAULT NULL COMMENT 'Không tự động cộng hàng khi có giá trị này' |
| `related_order_id` | int DEFAULT NULL COMMENT 'Đơn gốc khi tạo đơn thay thế để đổi hàng' |
| `stock_hold_status` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'NONE' COMMENT 'NONE / TEMPORARY / PAID / CONSUMED / RELEASED / EXPIRED' |
| `stock_hold_payment_id` | int DEFAULT NULL COMMENT 'Lần thử trả tiền đang được giữ hàng; phải thuộc đơn này' |
| `stock_hold_expires_at` | datetime DEFAULT NULL COMMENT 'Hạn giữ tạm; giữ PAID không hết hạn tự động' |
| `stock_hold_created_at` | datetime DEFAULT NULL COMMENT 'Mốc bắt đầu giữ hiện hành' |
| `stock_hold_paid_at` | datetime DEFAULT NULL COMMENT 'Mốc callback thành công' |
| `stock_hold_closed_at` | datetime DEFAULT NULL COMMENT 'Mốc tiêu thụ hoặc giải phóng giữ' |
| `stock_hold_close_reason` | varchar(255) DEFAULT NULL COMMENT 'Lý do đóng giữ hàng' |
| `stock_hold_key` | varchar(100) DEFAULT NULL COMMENT 'Khóa idempotency của lần giữ hiện hành; các lần cũ ghi audit_log' |
| `shipping_carrier` | varchar(50) DEFAULT NULL COMMENT 'Đơn vị vận chuyển' |
| `shipping_service_code` | varchar(50) DEFAULT NULL COMMENT 'Mã dịch vụ vận chuyển' |
| `provider_shipment_id` | varchar(100) DEFAULT NULL COMMENT 'Mã lô giao hàng trên nhà vận chuyển' |
| `tracking_number` | varchar(100) DEFAULT NULL COMMENT 'Mã vận đơn; một lô giao mỗi đơn ở phiên bản đầu' |
| `shipment_status` | varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Trạng thái giao vận riêng với trạng thái xử lý đơn' |
| `carrier_shipping_fee` | decimal(12,0) DEFAULT NULL COMMENT 'Phí dịch vụ thực tế; shipping_fee là số tiền khách trả' |
| `cod_amount` | decimal(12,0) DEFAULT NULL COMMENT 'Số tiền nhà vận chuyển thu hộ' |
| `shipment_created_at` | datetime DEFAULT NULL COMMENT 'Mốc tạo vận đơn' |
| `shipment_picked_up_at` | datetime DEFAULT NULL COMMENT 'Mốc nhà vận chuyển nhận hàng' |
| `shipment_delivered_at` | datetime DEFAULT NULL COMMENT 'Mốc giao thành công' |
| `shipment_updated_at` | datetime DEFAULT NULL COMMENT 'Mốc cập nhật giao vận' |
| `shipment_last_event_id` | varchar(100) DEFAULT NULL COMMENT 'Kiểm soát webhook vận chuyển lặp' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`order_id`)
UNIQUE KEY `uq_orders_1` (`order_number`)
UNIQUE KEY `uq_orders_2` (`stock_hold_key`)
UNIQUE KEY `uq_orders_3` (`shipping_carrier`,`tracking_number`)
KEY `ix_orders_1` (`order_status`,`payment_expires_at`)
KEY `ix_orders_2` (`user_id`,`order_type`,`order_date`)
KEY `ix_orders_3` (`created_by`,`order_type`,`order_date`)
KEY `ix_orders_4` (`stock_hold_status`,`stock_hold_expires_at`)
KEY `fk_orders_discount_code_id` (`discount_code_id`)
KEY `fk_orders_promotion_id` (`promotion_id`)
KEY `fk_orders_confirmed_by` (`confirmed_by`)
KEY `fk_orders_related_order_id` (`related_order_id`)
KEY `fk_orders_stock_hold_payment_id` (`stock_hold_payment_id`)
CONSTRAINT `fk_orders_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `fk_orders_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `fk_orders_discount_code_id` FOREIGN KEY (`discount_code_id`) REFERENCES `discount_code` (`discount_code_id`)
CONSTRAINT `fk_orders_promotion_id` FOREIGN KEY (`promotion_id`) REFERENCES `promotion` (`promotion_id`)
CONSTRAINT `fk_orders_related_order_id` FOREIGN KEY (`related_order_id`) REFERENCES `orders` (`order_id`)
CONSTRAINT `fk_orders_stock_hold_payment_id` FOREIGN KEY (`stock_hold_payment_id`) REFERENCES `payment` (`payment_id`)
CONSTRAINT `fk_orders_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
CONSTRAINT `ck_orders_1` CHECK ((`order_type` in (_utf8mb4'Online',_utf8mb4'In-Store')))
CONSTRAINT `ck_orders_10` CHECK ((`shipping_fee` >= 0))
CONSTRAINT `ck_orders_11` CHECK ((`stock_hold_status` in (_utf8mb4'NONE',_utf8mb4'TEMPORARY',_utf8mb4'PAID',_utf8mb4'CONSUMED',_utf8mb4'RELEASED',_utf8mb4'EXPIRED')))
CONSTRAINT `ck_orders_12` CHECK ((`shipment_status` in (_utf8mb4'CREATED',_utf8mb4'AWAITING_PICKUP',_utf8mb4'IN_TRANSIT',_utf8mb4'DELIVERED',_utf8mb4'FAILED',_utf8mb4'RETURNING',_utf8mb4'RETURNED',_utf8mb4'CANCELLED')))
CONSTRAINT `ck_orders_13` CHECK ((`carrier_shipping_fee` >= 0))
CONSTRAINT `ck_orders_14` CHECK ((`cod_amount` >= 0))
CONSTRAINT `ck_orders_15` CHECK (((`stock_hold_status` not in (_utf8mb4'TEMPORARY',_utf8mb4'PAID')) or (`stock_hold_payment_id` is not null)))
CONSTRAINT `ck_orders_16` CHECK (((`stock_hold_status` <> _utf8mb4'TEMPORARY') or (`stock_hold_expires_at` is not null)))
CONSTRAINT `ck_orders_17` CHECK (((`stock_hold_status` <> _utf8mb4'PAID') or ((`stock_hold_paid_at` is not null) and (`stock_hold_expires_at` is null))))
CONSTRAINT `ck_orders_2` CHECK ((`order_status` in (_utf8mb4'AWAITING_PAYMENT',_utf8mb4'PENDING_CONFIRMATION',_utf8mb4'AWAITING_PICKUP',_utf8mb4'SHIPPING',_utf8mb4'DELIVERED',_utf8mb4'COMPLETED',_utf8mb4'CANCELLED',_utf8mb4'REJECTED',_utf8mb4'EXPIRED')))
CONSTRAINT `ck_orders_3` CHECK ((`total_amount` >= 0))
CONSTRAINT `ck_orders_4` CHECK ((`preparation_status` in (_utf8mb4'NOT_STARTED',_utf8mb4'PREPARING',_utf8mb4'PREPARED')))
CONSTRAINT `ck_orders_5` CHECK ((`payment_method` in (_utf8mb4'CASH',_utf8mb4'COD',_utf8mb4'ONLINE')))
CONSTRAINT `ck_orders_6` CHECK ((`payment_status` in (_utf8mb4'UNPAID',_utf8mb4'PAID',_utf8mb4'REFUND_PENDING',_utf8mb4'PARTIALLY_REFUNDED',_utf8mb4'REFUNDED',_utf8mb4'NOT_REQUIRED')))
CONSTRAINT `ck_orders_7` CHECK ((`items_amount` >= 0))
CONSTRAINT `ck_orders_8` CHECK ((`promotion_discount_amount` >= 0))
CONSTRAINT `ck_orders_9` CHECK ((`coupon_discount_amount` >= 0))
```

## payment

Lần thanh toán, provider, trạng thái và thông tin hoàn tiền; mới có schema.

| Cột | Định nghĩa trong dump |
|---|---|
| `payment_id` | int NOT NULL AUTO_INCREMENT |
| `order_id` | int NOT NULL COMMENT 'Một đơn có thể thanh toán nhiều lần (thử lại)' |
| `transaction_ref` | varchar(100) DEFAULT NULL COMMENT 'Mã giao dịch từ cổng thanh toán' |
| `payment_method` | varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL |
| `payment_status` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'PENDING / SUCCESS / FAILED / EXPIRED; trạng thái một lần thử thanh toán' |
| `amount` | decimal(12,0) NOT NULL |
| `attempted_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `provider` | varchar(50) DEFAULT NULL COMMENT 'Nhà cung cấp thanh toán; transaction_ref phải duy nhất theo quy ước tích hợp' |
| `paid_at` | datetime DEFAULT NULL COMMENT 'Lưu khi SUCCESS' |
| `failure_reason` | varchar(255) DEFAULT NULL COMMENT 'Lỗi hoặc lý do từ chối thanh toán' |
| `refunded_amount` | decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Tổng tiền đã hoàn thành công của lần thu tiền này' |
| `refund_history` | json DEFAULT NULL COMMENT 'Mảng các lần hoàn: amount/status/ref/idempotency_key/reason/requested_by/requested_at/completed_at/return_request_id' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`payment_id`)
UNIQUE KEY `uq_payment_1` (`transaction_ref`)
KEY `ix_payment_1` (`order_id`,`payment_status`,`attempted_at`)
CONSTRAINT `fk_payment_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`)
CONSTRAINT `ck_payment_1` CHECK ((`payment_method` in (_utf8mb4'CASH',_utf8mb4'COD',_utf8mb4'ONLINE')))
CONSTRAINT `ck_payment_2` CHECK ((`payment_status` in (_utf8mb4'PENDING',_utf8mb4'SUCCESS',_utf8mb4'FAILED',_utf8mb4'EXPIRED')))
CONSTRAINT `ck_payment_3` CHECK ((`amount` > 0))
CONSTRAINT `ck_payment_4` CHECK ((`refunded_amount` between 0 and `amount`))
```

## product

Sản phẩm cấp cha thuộc category.

| Cột | Định nghĩa trong dump |
|---|---|
| `product_id` | int NOT NULL AUTO_INCREMENT |
| `category_id` | int NOT NULL |
| `product_name` | varchar(200) NOT NULL COMMENT 'Index (tìm theo tên)' |
| `description` | text |
| `status` | varchar(20) NOT NULL |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`product_id`)
KEY `ix_product_1` (`product_name`)
KEY `fk_product_category_id` (`category_id`)
CONSTRAINT `fk_product_category_id` FOREIGN KEY (`category_id`) REFERENCES `category` (`category_id`)
```

## product_detail

Biến thể màu/size, giá, tổng tồn và cờ bán online.

| Cột | Định nghĩa trong dump |
|---|---|
| `detail_id` | int NOT NULL AUTO_INCREMENT |
| `product_id` | int NOT NULL COMMENT 'UNIQUE (product_id, size, color)' |
| `size` | varchar(10) NOT NULL |
| `color` | varchar(30) NOT NULL |
| `price` | decimal(12,0) NOT NULL COMMENT 'VNĐ, không có phần lẻ' |
| `stock_quantity` | int NOT NULL DEFAULT '0' COMMENT 'Tồn vật lý trong kho. Giữ hàng không trừ cột này; bán hàng chỉ trừ khi Owner xác nhận.' |
| `online_sales_enabled` | tinyint(1) NOT NULL DEFAULT '0' |
| `status` | varchar(20) NOT NULL |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`detail_id`)
UNIQUE KEY `uq_product_detail_1` (`product_id`,`size`,`color`)
KEY `ix_product_detail_1` (`online_sales_enabled`,`status`)
CONSTRAINT `fk_product_detail_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`)
CONSTRAINT `ck_product_detail_1` CHECK ((`price` >= 0))
CONSTRAINT `ck_product_detail_2` CHECK ((`stock_quantity` >= 0))
CONSTRAINT `ck_product_detail_3` CHECK ((`online_sales_enabled` in (0,1)))
```

## product_image

Ảnh catalog/Cloudinary, primary và xóa mềm.

| Cột | Định nghĩa trong dump |
|---|---|
| `image_id` | int NOT NULL AUTO_INCREMENT |
| `product_id` | int NOT NULL |
| `image_url` | varchar(500) NOT NULL |
| `is_primary` | tinyint(1) NOT NULL DEFAULT '0' |
| `uploaded_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `cloud_public_id` | varchar(255) DEFAULT NULL COMMENT 'Định danh tài nguyên cloud để thay/xóa ảnh' |
| `deleted_at` | datetime DEFAULT NULL COMMENT 'Xóa mềm để bảo toàn lịch sử' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`image_id`)
KEY `ix_product_image_1` (`product_id`,`deleted_at`)
CONSTRAINT `fk_product_image_product_id` FOREIGN KEY (`product_id`) REFERENCES `product` (`product_id`)
CONSTRAINT `ck_product_image_1` CHECK ((`is_primary` in (0,1)))
```

## product_location

Phân bổ một biến thể vào một tầng, quantity/mô tả.

| Cột | Định nghĩa trong dump |
|---|---|
| `product_location_id` | int NOT NULL AUTO_INCREMENT |
| `detail_id` | int NOT NULL COMMENT 'UNIQUE (detail_id, shelf_level_id)' |
| `shelf_level_id` | int NOT NULL |
| `quantity` | int NOT NULL DEFAULT '0' COMMENT 'Gán lần đầu phải > 0; sau xuất hết có thể = 0 để giữ mô tả và ảnh' |
| `description` | text COMMENT 'Mô tả thực tế tại vị trí; backend kiểm tra cùng ảnh và quantity > 0' |
| `updated_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Cập nhật khi xếp, chuyển, xuất hoặc nhập lại' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`product_location_id`)
UNIQUE KEY `uq_product_location_1` (`detail_id`,`shelf_level_id`)
KEY `fk_product_location_shelf_level_id` (`shelf_level_id`)
CONSTRAINT `fk_product_location_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`)
CONSTRAINT `fk_product_location_shelf_level_id` FOREIGN KEY (`shelf_level_id`) REFERENCES `shelf_level` (`shelf_level_id`)
CONSTRAINT `ck_product_location_1` CHECK ((`quantity` >= 0))
```

## product_location_image

Ảnh thực tế tại vị trí; URL có thể là API file local.

| Cột | Định nghĩa trong dump |
|---|---|
| `product_location_image_id` | int NOT NULL AUTO_INCREMENT |
| `product_location_id` | int NOT NULL |
| `image_url` | varchar(500) NOT NULL |
| `cloud_public_id` | varchar(255) DEFAULT NULL COMMENT 'Định danh tài nguyên cloud để thay/xóa ảnh' |
| `deleted_at` | datetime DEFAULT NULL COMMENT 'Xóa mềm để bảo toàn lịch sử' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`product_location_image_id`)
KEY `ix_product_location_image_1` (`product_location_id`,`deleted_at`)
CONSTRAINT `fk_product_location_image_product_location_id` FOREIGN KEY (`product_location_id`) REFERENCES `product_location` (`product_location_id`)
```

## promotion

Chương trình khuyến mại; mới có schema.

| Cột | Định nghĩa trong dump |
|---|---|
| `promotion_id` | int NOT NULL AUTO_INCREMENT |
| `name` | varchar(100) NOT NULL |
| `description` | varchar(255) DEFAULT NULL |
| `discount_value` | decimal(12,2) NOT NULL |
| `start_date` | date NOT NULL |
| `end_date` | date NOT NULL |
| `status` | varchar(20) NOT NULL |
| `created_by` | int NOT NULL COMMENT 'Owner tạo' |
| `discount_type` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'PERCENT: 0–100; FIXED: số tiền VNĐ nguyên' |
| `min_order_value` | decimal(12,0) NOT NULL DEFAULT '0' |
| `max_discount_amount` | decimal(12,0) DEFAULT NULL COMMENT 'Mức giảm tối đa khi giảm theo phần trăm' |
| `usage_limit` | int DEFAULT NULL COMMENT 'NULL = không giới hạn; số nguyên dương = số lượt sử dụng tối đa' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`promotion_id`)
KEY `fk_promotion_created_by` (`created_by`)
CONSTRAINT `fk_promotion_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `ck_promotion_1` CHECK ((`discount_value` >= 0))
CONSTRAINT `ck_promotion_2` CHECK ((`end_date` > `start_date`))
CONSTRAINT `ck_promotion_3` CHECK ((`discount_type` in (_utf8mb4'PERCENT',_utf8mb4'FIXED')))
CONSTRAINT `ck_promotion_4` CHECK ((`min_order_value` >= 0))
CONSTRAINT `ck_promotion_5` CHECK ((`max_discount_amount` >= 0))
CONSTRAINT `ck_promotion_6` CHECK (((`discount_type` <> _utf8mb4'PERCENT') or (`discount_value` <= 100)))
CONSTRAINT `ck_promotion_7` CHECK (((`discount_type` <> _utf8mb4'FIXED') or (`discount_value` = floor(`discount_value`))))
CONSTRAINT `ck_promotion_usage_limit` CHECK (((`usage_limit` is null) or (`usage_limit` >= 1)))
```

## rack

Kệ với mã/khu vực/tọa độ 2D/cờ hoạt động.

| Cột | Định nghĩa trong dump |
|---|---|
| `rack_id` | int NOT NULL AUTO_INCREMENT |
| `rack_code` | varchar(20) NOT NULL COMMENT 'Lưu A, B, C, D; giao diện hiển thị Kệ A. Tọa độ có thể sửa.' |
| `zone` | varchar(50) DEFAULT NULL COMMENT 'Khu vực' |
| `coordinate_x` | decimal(8,2) NOT NULL COMMENT 'Tọa độ trên bản đồ 2D' |
| `coordinate_y` | decimal(8,2) NOT NULL |
| `is_active` | tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Ẩn kệ rỗng thay vì xóa lịch sử' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`rack_id`)
UNIQUE KEY `uq_rack_1` (`rack_code`)
CONSTRAINT `ck_rack_1` CHECK ((`is_active` in (0,1)))
```

## return_request

Yêu cầu đổi/trả của khách, khác phiếu trả NCC.

| Cột | Định nghĩa trong dump |
|---|---|
| `return_request_id` | int NOT NULL AUTO_INCREMENT |
| `order_id` | int NOT NULL |
| `user_id` | int DEFAULT NULL COMMENT 'Khách online; NULL khi khách mua tại quầy không có tài khoản' |
| `reason` | text NOT NULL |
| `status` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'PENDING / APPROVED / REJECTED / RECEIVED / COMPLETED' |
| `requested_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `processed_at` | datetime DEFAULT NULL |
| `created_by` | int NOT NULL COMMENT 'Khách tạo yêu cầu online hoặc người bán ghi nhận tại quầy' |
| `request_type` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Đổi hàng tạo đơn thay thế qua orders.related_order_id' |
| `processed_by` | int DEFAULT NULL COMMENT 'Chỉ Owner xử lý' |
| `customer_name` | varchar(100) DEFAULT NULL COMMENT 'Thông tin khách vãng lai nếu cần' |
| `customer_phone` | varchar(15) DEFAULT NULL COMMENT 'Thông tin liên hệ khách tại quầy' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`return_request_id`)
KEY `ix_return_request_1` (`order_id`,`requested_at`)
KEY `ix_return_request_2` (`status`,`requested_at`)
KEY `fk_return_request_user_id` (`user_id`)
KEY `fk_return_request_created_by` (`created_by`)
KEY `fk_return_request_processed_by` (`processed_by`)
CONSTRAINT `fk_return_request_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `fk_return_request_order_id` FOREIGN KEY (`order_id`) REFERENCES `orders` (`order_id`)
CONSTRAINT `fk_return_request_processed_by` FOREIGN KEY (`processed_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `fk_return_request_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
CONSTRAINT `ck_return_request_1` CHECK ((`status` in (_utf8mb4'PENDING',_utf8mb4'APPROVED',_utf8mb4'REJECTED',_utf8mb4'RECEIVED',_utf8mb4'COMPLETED')))
CONSTRAINT `ck_return_request_2` CHECK ((`request_type` in (_utf8mb4'RETURN',_utf8mb4'EXCHANGE')))
```

## return_request_item

Dòng khách đổi/trả, lượng nhận lại/nhập lại và refund.

| Cột | Định nghĩa trong dump |
|---|---|
| `return_request_item_id` | int NOT NULL AUTO_INCREMENT |
| `return_request_id` | int NOT NULL |
| `order_item_id` | int NOT NULL |
| `quantity_returned` | int NOT NULL |
| `item_reason` | varchar(255) DEFAULT NULL |
| `quantity_received` | int NOT NULL DEFAULT '0' COMMENT 'Số lượng Owner thực nhận; không vượt quantity_returned' |
| `quantity_restocked` | int NOT NULL DEFAULT '0' COMMENT 'Số hàng đạt chất lượng đã nhập lại; không vượt quantity_received' |
| `refund_amount` | decimal(12,0) NOT NULL DEFAULT '0' COMMENT 'Số tiền được duyệt hoàn theo giá và giảm giá thực tế' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`return_request_item_id`)
KEY `fk_return_request_item_return_request_id` (`return_request_id`)
KEY `fk_return_request_item_order_item_id` (`order_item_id`)
CONSTRAINT `fk_return_request_item_order_item_id` FOREIGN KEY (`order_item_id`) REFERENCES `order_item` (`order_item_id`)
CONSTRAINT `fk_return_request_item_return_request_id` FOREIGN KEY (`return_request_id`) REFERENCES `return_request` (`return_request_id`)
CONSTRAINT `ck_return_request_item_1` CHECK ((`quantity_returned` > 0))
CONSTRAINT `ck_return_request_item_2` CHECK ((`quantity_received` >= 0))
CONSTRAINT `ck_return_request_item_3` CHECK ((`quantity_restocked` >= 0))
CONSTRAINT `ck_return_request_item_4` CHECK ((`refund_amount` >= 0))
CONSTRAINT `ck_return_request_item_5` CHECK ((`quantity_received` <= `quantity_returned`))
CONSTRAINT `ck_return_request_item_6` CHECK ((`quantity_restocked` <= `quantity_received`))
```

## role

Năm vai trò ADMIN/OWNER/FAMILY_MEMBER/STAFF/CUSTOMER.

| Cột | Định nghĩa trong dump |
|---|---|
| `role_id` | int NOT NULL AUTO_INCREMENT |
| `role_name` | varchar(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Giá trị cố định: ADMIN, OWNER, FAMILY_MEMBER, STAFF, CUSTOMER. Guest không có tài khoản.' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`role_id`)
UNIQUE KEY `uq_role_1` (`role_name`)
CONSTRAINT `ck_role_1` CHECK ((`role_name` in (_utf8mb4'ADMIN',_utf8mb4'OWNER',_utf8mb4'FAMILY_MEMBER',_utf8mb4'STAFF',_utf8mb4'CUSTOMER')))
```

## shelf_level

Tầng thuộc kệ; trạng thái nhận hàng và cờ hoạt động.

| Cột | Định nghĩa trong dump |
|---|---|
| `shelf_level_id` | int NOT NULL AUTO_INCREMENT |
| `rack_id` | int NOT NULL COMMENT 'UNIQUE (rack_id, level_number)' |
| `level_number` | int NOT NULL COMMENT 'Cấu hình ban đầu 1–5; UNIQUE (rack_id, level_number)' |
| `status` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'AVAILABLE' COMMENT 'AVAILABLE / FULL / BLOCKED / MAINTENANCE' |
| `is_active` | tinyint(1) NOT NULL DEFAULT '1' COMMENT 'Chỉ ngừng sử dụng khi không chứa hàng' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`shelf_level_id`)
UNIQUE KEY `uq_shelf_level_1` (`rack_id`,`level_number`)
CONSTRAINT `fk_shelf_level_rack_id` FOREIGN KEY (`rack_id`) REFERENCES `rack` (`rack_id`)
CONSTRAINT `ck_shelf_level_1` CHECK ((`level_number` > 0))
CONSTRAINT `ck_shelf_level_2` CHECK ((`status` in (_utf8mb4'AVAILABLE',_utf8mb4'FULL',_utf8mb4'BLOCKED',_utf8mb4'MAINTENANCE')))
CONSTRAINT `ck_shelf_level_3` CHECK ((`is_active` in (0,1)))
```

## shift_change_request

Yêu cầu đổi ca; mới có schema.

| Cột | Định nghĩa trong dump |
|---|---|
| `request_id` | int NOT NULL AUTO_INCREMENT |
| `requested_by` | int NOT NULL COMMENT 'Nhân viên xin đổi ca' |
| `shift_id` | int NOT NULL COMMENT 'Ca của người xin đổi' |
| `target_user_id` | int NOT NULL COMMENT 'Nhân viên đổi ca cùng' |
| `target_shift_id` | int DEFAULT NULL COMMENT 'Ca của người kia; NULL nếu người kia chỉ nhận thay, không đổi lại ca nào' |
| `reason` | text |
| `status` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'Pending' COMMENT 'Pending / Approved / Rejected' |
| `requested_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `reviewed_at` | datetime DEFAULT NULL COMMENT 'NULL = chưa duyệt' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`request_id`)
KEY `ix_shift_change_request_1` (`status`,`requested_at`)
KEY `fk_shift_change_request_requested_by` (`requested_by`)
KEY `fk_shift_change_request_shift_id` (`shift_id`)
KEY `fk_shift_change_request_target_user_id` (`target_user_id`)
KEY `fk_shift_change_request_target_shift_id` (`target_shift_id`)
CONSTRAINT `fk_shift_change_request_requested_by` FOREIGN KEY (`requested_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `fk_shift_change_request_shift_id` FOREIGN KEY (`shift_id`) REFERENCES `work_shift` (`shift_id`)
CONSTRAINT `fk_shift_change_request_target_shift_id` FOREIGN KEY (`target_shift_id`) REFERENCES `work_shift` (`shift_id`)
CONSTRAINT `fk_shift_change_request_target_user_id` FOREIGN KEY (`target_user_id`) REFERENCES `user` (`user_id`)
CONSTRAINT `ck_shift_change_request_1` CHECK ((`target_user_id` <> `requested_by`))
CONSTRAINT `ck_shift_change_request_2` CHECK ((`status` in (_utf8mb4'Pending',_utf8mb4'Approved',_utf8mb4'Rejected')))
```

## stock_adjustment

Sổ biến động tổng tồn/chuyển vị trí và khóa idempotency.

| Cột | Định nghĩa trong dump |
|---|---|
| `adjustment_id` | int NOT NULL AUTO_INCREMENT |
| `detail_id` | int NOT NULL |
| `quantity_change` | int NOT NULL COMMENT 'Tác động tổng tồn; MOVE = 0, nhập/hoàn dương, xuất âm' |
| `reason` | varchar(255) NOT NULL |
| `adjusted_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `adjusted_by` | int NOT NULL COMMENT 'Owner thực hiện; giữ người thao tác để truy vết' |
| `movement_type` | varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'ADJUSTMENT' COMMENT 'ADJUSTMENT / RECEIPT / ORDER_OUT / MOVE / RESTOCK' |
| `movement_quantity` | int DEFAULT NULL COMMENT 'Số hàng thao tác; bắt buộc cho MOVE, dòng cũ dùng ABS(quantity_change)' |
| `source_location_id` | int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ' |
| `destination_location_id` | int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ' |
| `order_item_id` | int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ' |
| `receipt_item_id` | int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ' |
| `return_request_item_id` | int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ' |
| `original_out_adjustment_id` | int DEFAULT NULL COMMENT 'Liên kết dòng nguồn/đích; backend kiểm tra đúng biến thể và chứng từ' |
| `idempotency_key` | varchar(100) DEFAULT NULL COMMENT 'Khóa mỗi dòng kho; bắt buộc ở backend cho thao tác mới' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`adjustment_id`)
UNIQUE KEY `uq_stock_adjustment_1` (`idempotency_key`)
KEY `ix_stock_adjustment_1` (`detail_id`,`adjusted_at`)
KEY `ix_stock_adjustment_2` (`order_item_id`,`adjusted_at`)
KEY `ix_stock_adjustment_3` (`original_out_adjustment_id`)
KEY `fk_stock_adjustment_adjusted_by` (`adjusted_by`)
KEY `fk_stock_adjustment_source_location_id` (`source_location_id`)
KEY `fk_stock_adjustment_destination_location_id` (`destination_location_id`)
KEY `fk_stock_adjustment_receipt_item_id` (`receipt_item_id`)
KEY `fk_stock_adjustment_return_request_item_id` (`return_request_item_id`)
CONSTRAINT `fk_stock_adjustment_adjusted_by` FOREIGN KEY (`adjusted_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `fk_stock_adjustment_destination_location_id` FOREIGN KEY (`destination_location_id`) REFERENCES `product_location` (`product_location_id`)
CONSTRAINT `fk_stock_adjustment_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`)
CONSTRAINT `fk_stock_adjustment_order_item_id` FOREIGN KEY (`order_item_id`) REFERENCES `order_item` (`order_item_id`)
CONSTRAINT `fk_stock_adjustment_original_out_adjustment_id` FOREIGN KEY (`original_out_adjustment_id`) REFERENCES `stock_adjustment` (`adjustment_id`)
CONSTRAINT `fk_stock_adjustment_receipt_item_id` FOREIGN KEY (`receipt_item_id`) REFERENCES `stock_receipt_item` (`receipt_item_id`)
CONSTRAINT `fk_stock_adjustment_return_request_item_id` FOREIGN KEY (`return_request_item_id`) REFERENCES `return_request_item` (`return_request_item_id`)
CONSTRAINT `fk_stock_adjustment_source_location_id` FOREIGN KEY (`source_location_id`) REFERENCES `product_location` (`product_location_id`)
CONSTRAINT `ck_stock_adjustment_1` CHECK ((`movement_type` in (_utf8mb4'ADJUSTMENT',_utf8mb4'RECEIPT',_utf8mb4'ORDER_OUT',_utf8mb4'MOVE',_utf8mb4'RESTOCK')))
CONSTRAINT `ck_stock_adjustment_2` CHECK ((`movement_quantity` > 0))
CONSTRAINT `ck_stock_adjustment_3` CHECK ((((`movement_type` = _utf8mb4'MOVE') and (`quantity_change` = 0) and (`movement_quantity` is not null)) or ((`movement_type` <> _utf8mb4'MOVE') and (`quantity_change` <> 0))))
CONSTRAINT `ck_stock_adjustment_4` CHECK (((`movement_type` not in (_utf8mb4'RECEIPT',_utf8mb4'RESTOCK')) or (`quantity_change` > 0)))
CONSTRAINT `ck_stock_adjustment_5` CHECK (((`movement_type` <> _utf8mb4'ORDER_OUT') or (`quantity_change` < 0)))
CONSTRAINT `ck_stock_adjustment_6` CHECK (((`movement_type` = _utf8mb4'MOVE') or (`movement_quantity` is null) or (`movement_quantity` = abs(`quantity_change`))))
```

## stock_receipt

Header phiếu đặt/nhập; source dùng thêm trả NCC nhưng CHECK dump chưa hỗ trợ.

| Cột | Định nghĩa trong dump |
|---|---|
| `receipt_id` | int NOT NULL AUTO_INCREMENT |
| `receipt_type` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'PURCHASE_ORDER: phiếu đặt; RECEIPT: phiếu nhập' |
| `source_receipt_id` | int DEFAULT NULL COMMENT 'Phiếu nhập liên kết receipt_id của phiếu đặt gốc; phiếu đặt để NULL' |
| `manufacturer_name` | varchar(200) DEFAULT NULL COMMENT 'Tên bên sản xuất ghi trên phiếu đặt' |
| `created_by` | int NOT NULL COMMENT 'Phiếu đặt: OWNER tạo; phiếu nhập: OWNER hoặc FAMILY_MEMBER tạo' |
| `receipt_date` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `note` | varchar(255) DEFAULT NULL |
| `status` | varchar(30) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT / PENDING_CONFIRMATION / CONFIRMED / REJECTED / CANCELLED / CLOSED' |
| `confirmed_by` | int DEFAULT NULL COMMENT 'Người xác nhận phiếu; chỉ OWNER được thực hiện' |
| `confirmed_at` | datetime DEFAULT NULL COMMENT 'Thời điểm xác nhận; chỉ phiếu nhập RECEIPT mới cộng tồn' |
| `rejection_reason` | varchar(255) DEFAULT NULL COMMENT 'Owner ghi lý do từ chối' |
| `closed_at` | datetime DEFAULT NULL COMMENT 'Thời điểm Owner đóng phiếu đặt, kết thúc nhận hàng' |
| `close_reason` | varchar(255) DEFAULT NULL COMMENT 'Lý do đóng phiếu đặt: nhận đủ hoặc ngừng nhận phần còn thiếu' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`receipt_id`)
KEY `ix_stock_receipt_1` (`status`,`receipt_date`)
KEY `fk_stock_receipt_created_by` (`created_by`)
KEY `fk_stock_receipt_confirmed_by` (`confirmed_by`)
KEY `ix_receipt_source` (`source_receipt_id`)
CONSTRAINT `fk_receipt_source` FOREIGN KEY (`source_receipt_id`) REFERENCES `stock_receipt` (`receipt_id`)
CONSTRAINT `fk_stock_receipt_confirmed_by` FOREIGN KEY (`confirmed_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `fk_stock_receipt_created_by` FOREIGN KEY (`created_by`) REFERENCES `user` (`user_id`)
CONSTRAINT `ck_receipt_type` CHECK ((`receipt_type` in (_utf8mb4'PURCHASE_ORDER',_utf8mb4'RECEIPT')))
CONSTRAINT `ck_stock_receipt_1` CHECK ((`status` in (_utf8mb4'DRAFT',_utf8mb4'PENDING_CONFIRMATION',_utf8mb4'CONFIRMED',_utf8mb4'REJECTED',_utf8mb4'CANCELLED',_utf8mb4'CLOSED')))
```

## stock_receipt_item

Dòng chứng từ và liên kết dòng nguồn.

| Cột | Định nghĩa trong dump |
|---|---|
| `receipt_item_id` | int NOT NULL AUTO_INCREMENT |
| `receipt_id` | int NOT NULL |
| `detail_id` | int NOT NULL |
| `source_receipt_item_id` | int DEFAULT NULL COMMENT 'Liên kết receipt_item_id của dòng đặt gốc; dòng đặt để NULL' |
| `quantity` | int NOT NULL COMMENT 'Phiếu đặt: số lượng đặt; phiếu nhập: số lượng thực nhận của từng biến thể' |
| `unit_price` | decimal(12,0) NOT NULL COMMENT 'Đơn giá đặt hoặc thực nhập bằng VNĐ' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`receipt_item_id`)
KEY `fk_stock_receipt_item_receipt_id` (`receipt_id`)
KEY `fk_stock_receipt_item_detail_id` (`detail_id`)
KEY `ix_receipt_item_source` (`source_receipt_item_id`)
CONSTRAINT `fk_receipt_item_source` FOREIGN KEY (`source_receipt_item_id`) REFERENCES `stock_receipt_item` (`receipt_item_id`)
CONSTRAINT `fk_stock_receipt_item_detail_id` FOREIGN KEY (`detail_id`) REFERENCES `product_detail` (`detail_id`)
CONSTRAINT `fk_stock_receipt_item_receipt_id` FOREIGN KEY (`receipt_id`) REFERENCES `stock_receipt` (`receipt_id`)
CONSTRAINT `ck_receipt_item_price` CHECK ((`unit_price` >= 0))
CONSTRAINT `ck_stock_receipt_item_1` CHECK ((`quantity` > 0))
```

## user

Danh tính, liên hệ, trạng thái và slot OTP; không có auth_version/google_subject/created_by.

| Cột | Định nghĩa trong dump |
|---|---|
| `user_id` | int NOT NULL AUTO_INCREMENT |
| `role_id` | int NOT NULL |
| `full_name` | varchar(100) NOT NULL |
| `password_hash` | varchar(255) NOT NULL COMMENT 'Lưu hash, không lưu mật khẩu thô' |
| `email` | varchar(100) NOT NULL COMMENT 'Index (đăng nhập)' |
| `phone` | varchar(15) DEFAULT NULL |
| `address` | varchar(255) DEFAULT NULL |
| `account_status` | varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL DEFAULT 'ACTIVE' COMMENT 'PENDING_VERIFICATION / ACTIVE / LOCKED / DISABLED' |
| `created_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP |
| `avatar_url` | varchar(500) DEFAULT NULL COMMENT 'Ảnh hồ sơ trên dịch vụ lưu ảnh' |
| `updated_at` | datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Cập nhật khi sửa hồ sơ' |
| `email_verified_at` | datetime DEFAULT NULL COMMENT 'Thời điểm email được xác minh thành công' |
| `verification_code_hash` | varchar(255) DEFAULT NULL COMMENT 'Lưu mã HMAC-SHA256 của OTP, không lưu OTP gốc' |
| `verification_expires_at` | datetime DEFAULT NULL COMMENT 'Thời điểm OTP hết hạn, mặc định sau 5 phút' |
| `verification_attempt_count` | int NOT NULL DEFAULT '0' COMMENT 'Số lần nhập OTP sai, tối đa 5 lần' |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`user_id`)
UNIQUE KEY `uq_user_2` (`email`)
KEY `fk_user_role_id` (`role_id`)
CONSTRAINT `fk_user_role_id` FOREIGN KEY (`role_id`) REFERENCES `role` (`role_id`)
CONSTRAINT `ck_user_1` CHECK ((`account_status` in (_utf8mb4'PENDING_VERIFICATION',_utf8mb4'ACTIVE',_utf8mb4'LOCKED',_utf8mb4'DISABLED')))
```

## user_notification

Người nhận và trạng thái đọc thông báo.

| Cột | Định nghĩa trong dump |
|---|---|
| `user_notification_id` | int NOT NULL AUTO_INCREMENT |
| `user_id` | int NOT NULL |
| `notification_id` | int NOT NULL COMMENT 'UNIQUE (user_id, notification_id)' |
| `is_read` | tinyint(1) NOT NULL DEFAULT '0' |
| `read_at` | datetime DEFAULT NULL |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`user_notification_id`)
UNIQUE KEY `uq_user_notification_1` (`user_id`,`notification_id`)
KEY `ix_user_notification_1` (`user_id`,`is_read`)
KEY `fk_user_notification_notification_id` (`notification_id`)
CONSTRAINT `fk_user_notification_notification_id` FOREIGN KEY (`notification_id`) REFERENCES `notification` (`notification_id`)
CONSTRAINT `fk_user_notification_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
CONSTRAINT `ck_user_notification_1` CHECK ((`is_read` in (0,1)))
```

## work_shift

Ca làm của user; mới có schema.

| Cột | Định nghĩa trong dump |
|---|---|
| `shift_id` | int NOT NULL AUTO_INCREMENT |
| `user_id` | int NOT NULL COMMENT 'Nhân viên được xếp ca; UNIQUE (user_id, shift_date, start_time)' |
| `shift_date` | date NOT NULL |
| `start_time` | time NOT NULL |
| `end_time` | time NOT NULL |
| `status` | varchar(20) NOT NULL |

**Khóa/index/ràng buộc trong dump:**

```sql
PRIMARY KEY (`shift_id`)
UNIQUE KEY `uq_work_shift_1` (`user_id`,`shift_date`,`start_time`)
KEY `ix_work_shift_1` (`shift_date`,`status`)
CONSTRAINT `fk_work_shift_user_id` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`)
```

---

Tổng cộng: **29 bảng, 266 cột**. Đây là tài liệu tra cứu, không phải migration hoặc script cài đặt.

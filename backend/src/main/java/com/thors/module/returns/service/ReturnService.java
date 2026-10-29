package com.thors.module.returns.service;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.returns.dto.CreateReturnRequest;
import com.thors.module.returns.dto.ProcessReturnRequest;
import com.thors.module.returns.dto.ReturnRequestResponse;
import com.thors.module.returns.dto.ReturnableOrderResponse;
import com.thors.module.returns.repository.ReturnRepository;
import com.thors.security.SessionAccess;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class ReturnService {

    private static final Logger logger = LoggerFactory.getLogger(ReturnService.class);

    private final ReturnRepository returnRepository;
    private final SessionAccess sessionAccess;

    public ReturnService(ReturnRepository returnRepository, SessionAccess sessionAccess) {
        this.returnRepository = returnRepository;
        this.sessionAccess = sessionAccess;
    }

    // ==========================================
    // LOOKUP ORDER
    // ==========================================

    @Transactional(readOnly = true)
    public ReturnableOrderResponse getOrderByNumber(String orderNumber) {
        if (orderNumber == null || orderNumber.isBlank()) {
            throw new ApiException(400, "INVALID_ORDER_NUMBER", "Mã đơn hàng không được để trống.");
        }

        ReturnableOrderResponse order = returnRepository.findOrderByNumber(orderNumber.trim())
                .orElseThrow(() -> new ApiException(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng với mã: " + orderNumber));

        String status = order.getOrderStatus();
        if (!"DELIVERED".equalsIgnoreCase(status) && !"COMPLETED".equalsIgnoreCase(status)) {
            throw new ApiException(
                400,
                "ORDER_NOT_RETURNABLE",
                "Chỉ có thể hoàn hàng cho đơn hàng đã hoàn tất hoặc giao thành công (COMPLETED hoặc DELIVERED). Trạng thái hiện tại: " + status
            );
        }

        return order;
    }

    // ==========================================
    // CREATE RETURN REQUEST
    // ==========================================

    @Transactional
    public ReturnRequestResponse createReturnRequest(CreateReturnRequest request) {
        Account currentUser = sessionAccess.current();

        if (request == null) {
            throw new ApiException(400, "INVALID_REQUEST", "Dữ liệu yêu cầu hoàn hàng không hợp lệ.");
        }

        String orderNumber = request.getOrderNumber();
        if (orderNumber == null || orderNumber.isBlank()) {
            throw new ApiException(400, "INVALID_ORDER_NUMBER", "Mã đơn hàng không được để trống.");
        }

        String reason = request.getReason();
        if (reason == null || reason.isBlank()) {
            throw new ApiException(400, "REASON_REQUIRED", "Lý do hoàn hàng không được để trống.");
        }

        List<CreateReturnRequest.ItemRequest> items = request.getItems();
        if (items == null || items.isEmpty()) {
            throw new ApiException(400, "ITEMS_REQUIRED", "Cần chọn ít nhất một sản phẩm để hoàn trả.");
        }

        ReturnableOrderResponse order = getOrderByNumber(orderNumber);

        Map<Integer, ReturnableOrderResponse.OrderItemDetail> orderItemMap = order.getItems().stream()
                .collect(Collectors.toMap(ReturnableOrderResponse.OrderItemDetail::getOrderItemId, item -> item));

        for (CreateReturnRequest.ItemRequest itemReq : items) {
            if (itemReq.getOrderItemId() == null) {
                throw new ApiException(400, "INVALID_ITEM", "Mã sản phẩm trong đơn không hợp lệ.");
            }

            ReturnableOrderResponse.OrderItemDetail existingItem = orderItemMap.get(itemReq.getOrderItemId());
            if (existingItem == null) {
                throw new ApiException(400, "ITEM_NOT_IN_ORDER", "Sản phẩm không thuộc đơn hàng " + orderNumber);
            }

            int qty = itemReq.getQuantityReturned() != null ? itemReq.getQuantityReturned() : 0;
            if (qty <= 0) {
                throw new ApiException(400, "INVALID_QUANTITY", "Số lượng trả của sản phẩm " + existingItem.getProductName() + " phải lớn hơn 0.");
            }

            if (qty > existingItem.getQuantityReturnable()) {
                throw new ApiException(
                    400,
                    "QUANTITY_EXCEEDED",
                    "Số lượng trả (" + qty + ") vượt quá số lượng còn được phép hoàn (" + existingItem.getQuantityReturnable() + ") của sản phẩm " + existingItem.getProductName()
                );
            }
        }

        String requestType = "EXCHANGE".equalsIgnoreCase(request.getRequestType()) ? "EXCHANGE" : "RETURN";
        String customerName = request.getCustomerName() != null && !request.getCustomerName().isBlank()
                ? request.getCustomerName().trim()
                : order.getCustomerName();
        String customerPhone = request.getCustomerPhone() != null && !request.getCustomerPhone().isBlank()
                ? request.getCustomerPhone().trim()
                : order.getCustomerPhone();

        boolean isInstant = request.isInstantComplete();
        String initialStatus = isInstant ? "COMPLETED" : "PENDING";
        LocalDateTime now = LocalDateTime.now();

        int returnRequestId = returnRepository.insertReturnRequest(
                order.getOrderId(),
                currentUser.id(),
                reason.trim(),
                initialStatus,
                now,
                currentUser.id(),
                requestType,
                customerName,
                customerPhone
        );

        BigDecimal totalRefund = BigDecimal.ZERO;

        for (CreateReturnRequest.ItemRequest itemReq : items) {
            ReturnableOrderResponse.OrderItemDetail detail = orderItemMap.get(itemReq.getOrderItemId());
            int qtyReturned = itemReq.getQuantityReturned();
            int qtyReceived = isInstant
                    ? (itemReq.getQuantityReceived() != null ? itemReq.getQuantityReceived() : qtyReturned)
                    : 0;
            int qtyRestocked = isInstant
                    ? (itemReq.getQuantityRestocked() != null ? itemReq.getQuantityRestocked() : qtyReceived)
                    : 0;
            BigDecimal refund = itemReq.getRefundAmount() != null
                    ? itemReq.getRefundAmount()
                    : detail.getUnitPrice().multiply(BigDecimal.valueOf(isInstant ? qtyReceived : qtyReturned));

            int returnRequestItemId = returnRepository.insertReturnRequestItem(
                    returnRequestId,
                    itemReq.getOrderItemId(),
                    qtyReturned,
                    itemReq.getItemReason() != null ? itemReq.getItemReason().trim() : reason.trim(),
                    qtyReceived,
                    qtyRestocked,
                    refund
            );

            if (isInstant && qtyRestocked > 0) {
                returnRepository.restockProductDetail(detail.getDetailId(), qtyRestocked);
                String idempotencyKey = "RESTOCK:RET-" + returnRequestId + ":ITEM-" + returnRequestItemId + ":" + UUID.randomUUID().toString().substring(0, 8);
                returnRepository.insertStockAdjustmentRestock(
                        detail.getDetailId(),
                        qtyRestocked,
                        currentUser.id(),
                        "Nhập lại kho từ hoàn hàng tại quầy #" + orderNumber + " (Yêu cầu #" + returnRequestId + ")",
                        returnRequestItemId > 0 ? returnRequestItemId : null,
                        idempotencyKey
                );
            }

            if (isInstant) {
                totalRefund = totalRefund.add(refund);
            }
        }

        if (isInstant) {
            returnRepository.updateReturnRequestStatus(returnRequestId, "COMPLETED", currentUser.id(), now);
            if (totalRefund.compareTo(BigDecimal.ZERO) > 0) {
                returnRepository.updatePaymentRefund(order.getOrderId(), totalRefund);
            }
        }

        logger.info("Created return request {} (instant={}) for order {}", returnRequestId, isInstant, orderNumber);
        return returnRepository.findReturnRequestById(returnRequestId)
                .orElseThrow(() -> new ApiException(500, "SYSTEM_ERROR", "Lỗi tạo yêu cầu hoàn hàng."));
    }

    // ==========================================
    // GET RETURNS LIST & DETAIL
    // ==========================================

    @Transactional(readOnly = true)
    public Map<String, Object> getReturnRequests(String status, String search, int page, int pageSize) {
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, pageSize));
        int offset = (safePage - 1) * safeSize;

        List<ReturnRequestResponse> content = returnRepository.findReturnRequests(status, search, offset, safeSize);
        int totalElements = returnRepository.countReturnRequests(status, search);
        int totalPages = Math.max(1, (int) Math.ceil((double) totalElements / safeSize));

        return Map.of(
                "content", content,
                "totalElements", totalElements,
                "totalPages", totalPages,
                "currentPage", safePage,
                "pageSize", safeSize
        );
    }

    @Transactional(readOnly = true)
    public ReturnRequestResponse getReturnRequestById(int returnRequestId) {
        return returnRepository.findReturnRequestById(returnRequestId)
                .orElseThrow(() -> new ApiException(404, "RETURN_NOT_FOUND", "Không tìm thấy yêu cầu hoàn hàng ID: " + returnRequestId));
    }

    // ==========================================
    // PROCESS RETURN REQUEST (WORKFLOW)
    // ==========================================

    @Transactional
    public ReturnRequestResponse processReturnRequest(int returnRequestId, ProcessReturnRequest request) {
        Account currentUser = sessionAccess.current();

        // Check role: OWNER, ADMIN, STAFF
        String userRole = currentUser.role();
        if (!Set.of("OWNER", "ADMIN", "STAFF").contains(userRole)) {
            throw new ApiException(403, "FORBIDDEN", "Chỉ Quản lý (Owner/Admin) hoặc Nhân viên (Staff) mới có quyền xử lý hoàn hàng.");
        }

        ReturnRequestResponse returnReq = getReturnRequestById(returnRequestId);
        String currentStatus = returnReq.getStatus();
        String action = request.getAction() != null ? request.getAction().toUpperCase() : "";

        if (action.isBlank()) {
            throw new ApiException(400, "ACTION_REQUIRED", "Hành động xử lý (action) không được để trống.");
        }

        LocalDateTime now = LocalDateTime.now();

        switch (action) {
            case "APPROVE" -> {
                if (!"PENDING".equals(currentStatus)) {
                    throw new ApiException(400, "INVALID_STATE", "Chỉ có thể phê duyệt yêu cầu ở trạng thái Chờ xử lý (PENDING).");
                }
                returnRepository.updateReturnRequestStatus(returnRequestId, "APPROVED", currentUser.id(), now);
            }

            case "REJECT" -> {
                if ("COMPLETED".equals(currentStatus) || "REJECTED".equals(currentStatus)) {
                    throw new ApiException(400, "INVALID_STATE", "Không thể từ chối yêu cầu đã hoàn tất hoặc đã bị từ chối.");
                }
                returnRepository.updateReturnRequestStatus(returnRequestId, "REJECTED", currentUser.id(), now);
            }

            case "RECEIVE" -> {
                if (!"APPROVED".equals(currentStatus) && !"PENDING".equals(currentStatus)) {
                    throw new ApiException(400, "INVALID_STATE", "Chỉ có thể ghi nhận nhận hàng khi yêu cầu ở trạng thái PENDING hoặc APPROVED.");
                }

                if (request.getItems() != null && !request.getItems().isEmpty()) {
                    Map<Integer, ReturnRequestResponse.ItemDetail> itemMap = returnReq.getItems().stream()
                            .collect(Collectors.toMap(ReturnRequestResponse.ItemDetail::getReturnRequestItemId, i -> i));

                    for (ProcessReturnRequest.ProcessItemRequest itemReq : request.getItems()) {
                        ReturnRequestResponse.ItemDetail existing = itemMap.get(itemReq.getReturnRequestItemId());
                        if (existing != null) {
                            int qtyRecv = itemReq.getQuantityReceived() != null ? itemReq.getQuantityReceived() : existing.getQuantityReturned();
                            qtyRecv = Math.min(qtyRecv, existing.getQuantityReturned());
                            returnRepository.updateReturnRequestItem(
                                    existing.getReturnRequestItemId(),
                                    qtyRecv,
                                    existing.getQuantityRestocked(),
                                    existing.getRefundAmount()
                            );
                        }
                    }
                }
                returnRepository.updateReturnRequestStatus(returnRequestId, "RECEIVED", currentUser.id(), now);
            }

            case "COMPLETE" -> {
                if ("COMPLETED".equals(currentStatus)) {
                    throw new ApiException(400, "ALREADY_COMPLETED", "Yêu cầu hoàn hàng này đã được hoàn tất trước đó.");
                }
                if ("REJECTED".equals(currentStatus)) {
                    throw new ApiException(400, "INVALID_STATE", "Không thể hoàn tất yêu cầu đã bị từ chối.");
                }

                Map<Integer, ReturnRequestResponse.ItemDetail> itemMap = returnReq.getItems().stream()
                        .collect(Collectors.toMap(ReturnRequestResponse.ItemDetail::getReturnRequestItemId, i -> i));

                BigDecimal totalRefund = BigDecimal.ZERO;

                List<ProcessReturnRequest.ProcessItemRequest> processItems = request.getItems();
                if (processItems == null || processItems.isEmpty()) {
                    // Default fallback: receive all returned, restock all received, full refund
                    for (ReturnRequestResponse.ItemDetail existing : returnReq.getItems()) {
                        int qtyRecv = existing.getQuantityReceived() > 0 ? existing.getQuantityReceived() : existing.getQuantityReturned();
                        int qtyRestock = existing.getQuantityRestocked() > 0 ? existing.getQuantityRestocked() : qtyRecv;
                        BigDecimal refund = existing.getRefundAmount().compareTo(BigDecimal.ZERO) > 0
                                ? existing.getRefundAmount()
                                : existing.getUnitPrice().multiply(BigDecimal.valueOf(qtyRecv));

                        returnRepository.updateReturnRequestItem(
                                existing.getReturnRequestItemId(),
                                qtyRecv,
                                qtyRestock,
                                refund
                        );

                        if (qtyRestock > 0) {
                            returnRepository.restockProductDetail(existing.getDetailId(), qtyRestock);
                            String idempotencyKey = "RESTOCK:RET-" + returnRequestId + ":ITEM-" + existing.getReturnRequestItemId() + ":" + UUID.randomUUID().toString().substring(0, 8);
                            returnRepository.insertStockAdjustmentRestock(
                                    existing.getDetailId(),
                                    qtyRestock,
                                    currentUser.id(),
                                    "Nhập lại kho từ đơn hoàn #" + returnReq.getOrderNumber() + " (Yêu cầu #" + returnRequestId + ")",
                                    existing.getReturnRequestItemId(),
                                    idempotencyKey
                            );
                        }
                        totalRefund = totalRefund.add(refund);
                    }
                } else {
                    for (ProcessReturnRequest.ProcessItemRequest itemReq : processItems) {
                        ReturnRequestResponse.ItemDetail existing = itemMap.get(itemReq.getReturnRequestItemId());
                        if (existing == null) continue;

                        int qtyRecv = itemReq.getQuantityReceived() != null ? itemReq.getQuantityReceived() : existing.getQuantityReturned();
                        int qtyRestock = itemReq.getQuantityRestocked() != null ? itemReq.getQuantityRestocked() : 0;
                        BigDecimal refund = itemReq.getRefundAmount() != null
                                ? itemReq.getRefundAmount()
                                : existing.getUnitPrice().multiply(BigDecimal.valueOf(qtyRecv));

                        // Validations
                        if (qtyRecv > existing.getQuantityReturned()) {
                            throw new ApiException(400, "INVALID_RECEIVED_QTY", "Số lượng nhận không được vượt quá số lượng yêu cầu trả.");
                        }
                        if (qtyRestock > qtyRecv) {
                            throw new ApiException(400, "INVALID_RESTOCKED_QTY", "Số lượng nhập lại kho không được vượt quá số lượng thực nhận.");
                        }
                        if (refund.compareTo(BigDecimal.ZERO) < 0) {
                            throw new ApiException(400, "INVALID_REFUND_AMOUNT", "Số tiền hoàn không được âm.");
                        }

                        returnRepository.updateReturnRequestItem(
                                existing.getReturnRequestItemId(),
                                qtyRecv,
                                qtyRestock,
                                refund
                        );

                        if (qtyRestock > 0) {
                            returnRepository.restockProductDetail(existing.getDetailId(), qtyRestock);
                            String idempotencyKey = "RESTOCK:RET-" + returnRequestId + ":ITEM-" + existing.getReturnRequestItemId() + ":" + UUID.randomUUID().toString().substring(0, 8);
                            returnRepository.insertStockAdjustmentRestock(
                                    existing.getDetailId(),
                                    qtyRestock,
                                    currentUser.id(),
                                    "Nhập lại kho từ đơn hoàn #" + returnReq.getOrderNumber() + " (Yêu cầu #" + returnRequestId + ")",
                                    existing.getReturnRequestItemId(),
                                    idempotencyKey
                            );
                        }
                        totalRefund = totalRefund.add(refund);
                    }
                }

                if (totalRefund.compareTo(BigDecimal.ZERO) > 0) {
                    returnRepository.updatePaymentRefund(returnReq.getOrderId(), totalRefund);
                }

                returnRepository.updateReturnRequestStatus(returnRequestId, "COMPLETED", currentUser.id(), now);
                logger.info("Completed return request {} with total refund {}", returnRequestId, totalRefund);
            }

            default -> throw new ApiException(400, "UNKNOWN_ACTION", "Hành động không hợp lệ: " + action + ". Hỗ trợ: APPROVE, REJECT, RECEIVE, COMPLETE.");
        }

        return getReturnRequestById(returnRequestId);
    }

    // ==========================================
    // SEED SAMPLE ORDER FOR TESTING
    // ==========================================

    @Transactional
    public Map<String, Object> seedSampleOrder() {
        Account currentUser = sessionAccess.current();
        return returnRepository.seedSampleOrder(currentUser.id());
    }
}


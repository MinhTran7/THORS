package com.thors.module.sales.service;

import com.thors.common.ApiException;
import com.thors.module.sales.repository.InStoreSalesRepository;
import com.thors.module.sales.repository.InStoreSalesRepository.OrderLine;
import com.thors.module.sales.repository.InStoreSalesRepository.PendingSale;
import com.thors.module.warehouse.repository.WarehouseStore;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Optional;

@Service
public class InStoreSaleCompleter {

    private final InStoreSalesRepository repository;
    private final WarehouseStore warehouse;

    public InStoreSaleCompleter(InStoreSalesRepository repository, WarehouseStore warehouse) {
        this.repository = repository;
        this.warehouse = warehouse;
    }

    @Transactional
    public void complete(int orderId, String paymentMethod) {
        finish(lockAwaiting(orderId), paymentMethod);
    }

    @Transactional
    public PendingSale lockAwaiting(int orderId) {
        PendingSale sale = lockSale(orderId)
                .orElseThrow(() -> new ApiException(404, "NOT_FOUND", "Không tìm thấy hóa đơn bán hàng tại quầy."));
        if (!sale.awaitingPayment()) {
            throw new ApiException(400, "SALE_NOT_PENDING", "Hóa đơn không còn chờ thanh toán.");
        }
        return sale;
    }

    @Transactional
    public void onTransferPaid(int orderId) {
        lockSale(orderId).ifPresent(sale -> {
            if (sale.awaitingPayment()) {
                finish(sale, "ONLINE");
            } else if ("CANCELLED".equals(sale.orderStatus())) {
                repository.markRefundPending(orderId);
            }
        });
    }

    private Optional<PendingSale> lockSale(int orderId) {
        warehouse.lock();
        return repository.lockSale(orderId);
    }

    private void finish(PendingSale sale, String paymentMethod) {
        LocalDateTime now = LocalDateTime.now();
        String reason = "Bán tại cửa hàng " + sale.orderNumber();
        for (OrderLine line : repository.findOrderLines(sale.orderId())) {
            if (!repository.deductStock(line.detailId(), line.quantity())) {
                throw new ApiException(409, "INVALID_SALE", "Tồn kho vừa thay đổi. Vui lòng tải lại sản phẩm và thử lại.");
            }
            warehouse.recordSold(sale.sellerId(), line.detailId(), line.quantity(), line.orderItemId(),
                    "POS_OUT:item:" + line.orderItemId(), reason);
        }
        repository.releaseItems(sale.orderId());
        if ("CASH".equals(paymentMethod) && sale.total().signum() > 0) {
            repository.insertPayment(sale.orderId(), paymentMethod, sale.total(), now);
        }
        repository.markCompleted(sale.orderId(), paymentMethod, now);
        SaleNumbers.insertWithUniqueNumber("INV", number -> {
            repository.insertInvoice(sale.orderId(), number, sale.sellerId(), now);
            return number;
        });
    }
}

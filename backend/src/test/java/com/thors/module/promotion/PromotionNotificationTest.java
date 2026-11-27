package com.thors.module.promotion;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.module.account.entity.Account;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.promotion.dto.PromotionRequest;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import com.thors.module.promotion.service.PromotionNotifier;
import com.thors.module.promotion.service.PromotionService;
import com.thors.module.promotion.service.PromotionValidator;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Thông báo cho khách khi Owner tạo khuyến mãi. */
class PromotionNotificationTest {
    private PromotionRepository repository;
    private NotificationPublisher notifications;
    private PromotionService service;
    private Account actor;

    @BeforeEach
    void setUp() {
        repository = mock(PromotionRepository.class);
        notifications = mock(NotificationPublisher.class);
        actor = new Account(1, "OWNER", "Owner", "hash", "owner@example.com", "0900000000", null, null,
                "ACTIVE", LocalDateTime.now(), LocalDateTime.now(), null, 1L, null);
        service = new PromotionService(
                repository,
                new PromotionValidator(repository),
                new PromotionNotifier(notifications));

        when(repository.insert(any(), anyInt())).thenReturn(7);
        when(repository.findRunningProductPromotions(any())).thenReturn(List.of());
        TransactionSynchronizationManager.initSynchronization();
    }

    @AfterEach
    void tearDown() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    private PromotionRequest request(String type, String value, LocalDateTime start) {
        return new PromotionRequest(
                Promotion.PRODUCT_DISCOUNT, "Sale 11/11", null, type,
                new BigDecimal(value), BigDecimal.ZERO, null,
                start, start.plusDays(3), null, "ALL", List.of());
    }

    private String[] sent(boolean linked) {
        for (TransactionSynchronization sync : TransactionSynchronizationManager.getSynchronizations()) {
            sync.afterCommit();
        }
        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
        verify(notifications).toRole(eq("CUSTOMER"), eq(NotificationTypes.PROMOTION), title.capture(),
                message.capture(), linked ? eq(NotificationTypes.ENTITY_PRODUCT_SALE) : isNull(),
                linked ? eq(7) : isNull());
        return new String[] {title.getValue(), message.getValue()};
    }

    @Test
    void startingNowSaysItIsRunning() {
        service.create(actor, request("PERCENT", "20", LocalDateTime.now()));

        String[] n = sent(true);
        assertEquals("Sản phẩm đang giảm giá", n[0]);
        assertTrue(n[1].contains("Sale 11/11") && n[1].contains("giảm 20%"), n[1]);
    }

    @Test
    void startingLaterSaysWhenItStarts() {
        LocalDateTime start = LocalDateTime.of(2099, 11, 11, 9, 0);
        service.create(actor, request("FIXED", "50000", start));

        String[] n = sent(false);
        assertEquals("Sắp có giảm giá sản phẩm", n[0]);
        assertTrue(n[1].contains("giảm 50.000đ") && n[1].contains("từ 09:00 11/11/2099"), n[1]);
    }

    @Test
    void invalidRequestSendsNothing() {
        assertThrows(RuntimeException.class,
                () -> service.create(actor, request("PERCENT", "150", LocalDateTime.now())));
        verifyNoInteractions(notifications);
    }
}

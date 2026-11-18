package com.thors.module.promotion;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.module.account.entity.Account;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationTypes;
import com.thors.module.promotion.dto.CreatePromotionRequest;
import com.thors.module.promotion.entity.Promotion;
import com.thors.module.promotion.repository.PromotionRepository;
import com.thors.module.promotion.service.PromotionService;
import com.thors.security.SessionAccess;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Thông báo cho khách khi Owner tạo khuyến mãi. */
class PromotionNotificationTest {
    private PromotionRepository repository;
    private NotificationPublisher notifications;
    private PromotionService service;

    @BeforeEach
    void setUp() {
        repository = mock(PromotionRepository.class);
        notifications = mock(NotificationPublisher.class);
        SessionAccess sessions = mock(SessionAccess.class);
        when(sessions.current())
                .thenReturn(new Account(1, "OWNER", "Owner", "hash", "owner@example.com", "0900000000", null, null,
                        "ACTIVE", LocalDateTime.now(), LocalDateTime.now(), null, 1L, null));
        service = new PromotionService(repository, sessions, notifications);

        when(repository.create(any(), any(), any(), any(), any(), any(), any(), any(), any(), any(), anyInt()))
                .thenReturn(7);
        when(repository.findById(7))
                .thenReturn(Optional.of(new Promotion(7, "Sale", null, BigDecimal.TEN, LocalDateTime.now(),
                        LocalDateTime.now().plusDays(1), "ACTIVE", 1, "PERCENT", BigDecimal.ZERO, null, null,
                        "ALL", List.of())));
    }

    private CreatePromotionRequest request(String type, String value, LocalDateTime start) {
        return new CreatePromotionRequest("Sale 11/11", null, type, new BigDecimal(value), BigDecimal.ZERO, null,
                start, start.plusDays(3), null, "ALL", null);
    }

    private String[] sent(boolean linked) {
        ArgumentCaptor<String> title = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> message = ArgumentCaptor.forClass(String.class);
        verify(notifications).toRole(eq("CUSTOMER"), eq(NotificationTypes.PROMOTION), title.capture(),
                message.capture(), linked ? eq(NotificationTypes.ENTITY_PROMOTION) : isNull(),
                linked ? eq(7) : isNull());
        return new String[] {title.getValue(), message.getValue()};
    }

    @Test
    void startingNowSaysItIsRunning() {
        service.create(request("PERCENT", "20", LocalDateTime.now()));

        String[] n = sent(true);
        assertEquals("Khuyến mãi mới đang diễn ra", n[0]);
        assertTrue(n[1].contains("Sale 11/11") && n[1].contains("giảm 20%"), n[1]);
    }

    @Test
    void startingLaterSaysWhenItStarts() {
        LocalDateTime start = LocalDateTime.of(2099, 11, 11, 9, 0);
        service.create(request("FIXED", "50000", start));

        String[] n = sent(false);
        assertEquals("Sắp có khuyến mãi mới", n[0]);
        assertTrue(n[1].contains("giảm 50.000đ") && n[1].contains("09:00 11/11/2099"), n[1]);
    }

    @Test
    void invalidRequestSendsNothing() {
        assertThrows(RuntimeException.class, () -> service.create(request("PERCENT", "150", LocalDateTime.now())));
        verifyNoInteractions(notifications);
    }
}

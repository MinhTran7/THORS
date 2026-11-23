package com.thors.module.notification;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.notification.dto.NotificationViews.Preferences;
import com.thors.module.notification.dto.NotificationViews.UpdatePreferences;
import com.thors.module.notification.repository.NotificationMuteSchema;
import com.thors.module.notification.repository.NotificationRepository;
import com.thors.module.notification.service.NotificationPublisher;
import com.thors.module.notification.service.NotificationService;
import com.thors.module.notification.service.NotificationTypes;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

/** Bật / tắt thông báo khuyến mãi, kể cả khi DB chưa chạy migration notification_mute. */
class NotificationMuteTest {
    private NotificationRepository repository;
    private NotificationMuteSchema schema;
    private NotificationPublisher publisher;
    private NotificationService service;

    private final Account customer =
            new Account(5, "CUSTOMER", "Khách", "hash", "c@example.com", "0900000005", null, null, "ACTIVE",
                    LocalDateTime.now(), LocalDateTime.now(), null, 1L, null);

    @BeforeEach
    void setUp() {
        repository = mock(NotificationRepository.class);
        schema = mock(NotificationMuteSchema.class);
        when(repository.insert(any(), any(), any(), any(), any())).thenReturn(99);
        publisher = new NotificationPublisher(repository, schema);
        service = new NotificationService(repository, schema);
    }

    @Test
    void promotionToRoleSkipsMutedUsersWhenTableExists() {
        when(schema.ready()).thenReturn(true);

        publisher.toRole("CUSTOMER", NotificationTypes.PROMOTION, "t", "m", null, null);

        verify(repository).linkRole(99, "CUSTOMER", NotificationTypes.PROMOTION);
    }

    @Test
    void promotionToRoleSendsToEveryoneWhenTableMissing() {
        when(schema.ready()).thenReturn(false);

        publisher.toRole("CUSTOMER", NotificationTypes.PROMOTION, "t", "m", null, null);

        verify(repository).linkRole(99, "CUSTOMER", null);
    }

    @Test
    void orderNotificationsCannotBeMuted() {
        when(schema.ready()).thenReturn(true);

        publisher.toRole("OWNER", NotificationTypes.ORDER_STATUS, "t", "m", null, null);
        publisher.toUser(5, NotificationTypes.ORDER_STATUS, "t", "m");

        verify(repository).linkRole(99, "OWNER", null);
        verify(repository, never()).mutedAmong(any(), any());
        verify(repository).linkUsers(99, List.of(5));
    }

    @SuppressWarnings("unchecked")
    @Test
    void promotionToUsersDropsMutedUsers() {
        when(schema.ready()).thenReturn(true);
        when(repository.mutedAmong(eq(NotificationTypes.PROMOTION), any())).thenReturn(List.of(2));

        publisher.toUsers(List.of(1, 2, 3), NotificationTypes.PROMOTION, "t", "m", null, null);

        ArgumentCaptor<Collection<Integer>> sent = ArgumentCaptor.forClass(Collection.class);
        verify(repository).linkUsers(eq(99), sent.capture());
        assertEquals(java.util.Set.of(1, 3), java.util.Set.copyOf(sent.getValue()));
    }

    @Test
    void everyoneMutedCreatesNoNotification() {
        when(schema.ready()).thenReturn(true);
        when(repository.mutedAmong(eq(NotificationTypes.PROMOTION), any())).thenReturn(List.of(5));

        publisher.toUser(5, NotificationTypes.PROMOTION, "t", "m");

        verify(repository, never()).insert(any(), any(), any(), any(), any());
    }

    @Test
    void preferencesDefaultToOnAndCanBeTurnedOff() {
        when(schema.ready()).thenReturn(true);
        when(repository.isMuted(5, NotificationTypes.PROMOTION)).thenReturn(false, true);

        assertEquals(new Preferences(true, true), service.preferences(customer));
        assertEquals(new Preferences(true, false), service.updatePreferences(customer, new UpdatePreferences(false)));
        verify(repository).setMuted(5, NotificationTypes.PROMOTION, true);
    }

    @Test
    void preferencesUnavailableBeforeMigration() {
        when(schema.ready()).thenReturn(false);

        assertEquals(new Preferences(false, true), service.preferences(customer));
        ApiException e =
                assertThrows(ApiException.class, () -> service.updatePreferences(customer, new UpdatePreferences(false)));
        assertEquals(503, e.status);
        verify(repository, never()).setMuted(anyInt(), any(), anyBoolean());
    }

    @Test
    void updateRequiresAValue() {
        when(schema.ready()).thenReturn(true);

        ApiException e = assertThrows(ApiException.class, () -> service.updatePreferences(customer, new UpdatePreferences(null)));
        assertEquals(400, e.status);
    }
}

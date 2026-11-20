package com.thors.module.account;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

import com.thors.config.Settings;
import com.thors.module.account.entity.Account;
import com.thors.module.account.service.AccountMailService;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;

/** Email báo tài khoản mới: gửi đúng người, đúng nội dung; lỗi gửi chỉ trả false, không ném lỗi. */
class AccountMailServiceTest {
  private final Account created = new Account(50, "FAMILY_MEMBER", "Le Thi Gia Dinh", "$2a$hash",
          "family2@shop.com", null, null, null, "PENDING_VERIFICATION", LocalDateTime.now(), null, null, 0, 2);

  @SuppressWarnings("unchecked")
  private AccountMailService service(boolean emailEnabled, JavaMailSender sender) {
    var settings = new Settings("http://localhost:3000/", null,
            new Settings.Delivery(emailEnabled, "no-reply@thors.vn", false, "", "", ""), null, null, null);
    ObjectProvider<JavaMailSender> provider = mock(ObjectProvider.class);
    when(provider.getIfAvailable()).thenReturn(sender);
    return new AccountMailService(settings, provider);
  }

  @Test
  void sendsLoginDetailsToTheNewAccountEmail() {
    var sender = mock(JavaMailSender.class);

    assertTrue(service(true, sender).sendAccountCreated(created, "Temp-password-123"));

    var captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
    verify(sender).send(captor.capture());
    var m = captor.getValue();
    assertArrayEquals(new String[] {"family2@shop.com"}, m.getTo());
    assertEquals("no-reply@thors.vn", m.getFrom());
    assertTrue(m.getText().contains("Le Thi Gia Dinh"));
    assertTrue(m.getText().contains("Thành viên gia đình"));
    assertTrue(m.getText().contains("Temp-password-123"));
    assertTrue(m.getText().contains("http://localhost:3000/login"));
  }

  @Test
  void returnsFalseWhenEmailIsNotConfigured() {
    var sender = mock(JavaMailSender.class);

    assertFalse(service(false, sender).sendAccountCreated(created, "Temp-password-123"));
    assertFalse(service(true, null).sendAccountCreated(created, "Temp-password-123"));
    verifyNoInteractions(sender);
  }

  @Test
  void returnsFalseInsteadOfThrowingWhenSmtpFails() {
    var sender = mock(JavaMailSender.class);
    doThrow(new MailSendException("SMTP down")).when(sender).send(any(SimpleMailMessage.class));

    assertFalse(service(true, sender).sendAccountCreated(created, "Temp-password-123"));
  }
}

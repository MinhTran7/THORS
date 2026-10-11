package com.thors.integration.otp;

import com.thors.common.ApiException;
import com.thors.config.Settings;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

@Component
public class ConfiguredOtpSender implements OtpSender {
  private final Settings settings;
  private final ObjectProvider<JavaMailSender> mail;
  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

  public ConfiguredOtpSender(Settings settings, ObjectProvider<JavaMailSender> mail) {
    this.settings = settings;
    this.mail = mail;
  }

  public boolean available(String channel) {
    var d = settings.delivery();
    return "EMAIL".equals(channel)
        ? d.emailEnabled() && mail.getIfAvailable() != null && !d.emailFrom().isBlank()
        : "SMS".equals(channel)
            && d.smsEnabled()
            && !d.smsAccountSid().isBlank()
            && !d.smsAuthToken().isBlank()
            && !d.smsFrom().isBlank();
  }

  public void send(String channel, String dest, String code, int seconds) {
    if (!available(channel))
      throw new ApiException(
          503,
          "DELIVERY_NOT_CONFIGURED",
          "Kênh gửi OTP chưa được cấu hình. Vui lòng liên hệ người quản trị.");
    String text =
        "THORS: Ma xac minh cua ban la "
            + code
            + ". Co hieu luc "
            + seconds
            + " giay. Khong chia se ma nay.";
    try {
      if ("EMAIL".equals(channel)) {
        var m = new SimpleMailMessage();
        m.setFrom(settings.delivery().emailFrom());
        m.setTo(dest);
        m.setSubject("THORS - Mã xác minh tài khoản");
        m.setText(text);
        mail.getObject().send(m);
      } else {
        var d = settings.delivery();
        if (!d.smsAccountSid().matches("AC[a-fA-F0-9]{32}")) throw new IllegalArgumentException();
        String payload = "To=" + enc(dest) + "&From=" + enc(d.smsFrom()) + "&Body=" + enc(text);
        var req =
            HttpRequest.newBuilder(
                    URI.create(
                        "https://api.twilio.com/2010-04-01/Accounts/"
                            + d.smsAccountSid()
                            + "/Messages.json"))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .header(
                    "Authorization",
                    "Basic "
                        + Base64.getEncoder()
                            .encodeToString(
                                (d.smsAccountSid() + ":" + d.smsAuthToken())
                                    .getBytes(StandardCharsets.UTF_8)))
                .POST(HttpRequest.BodyPublishers.ofString(payload))
                .build();
        var response = http.send(req, HttpResponse.BodyHandlers.discarding());
        if (response.statusCode() != 201) throw new IllegalStateException();
      }
    } catch (Exception e) {
      if (e instanceof InterruptedException) Thread.currentThread().interrupt();
      throw new ApiException(503, "DELIVERY_FAILED", "Chưa gửi được OTP. Vui lòng thử lại sau.");
    }
  }

  private static String enc(String s) {
    return URLEncoder.encode(s, StandardCharsets.UTF_8);
  }
}

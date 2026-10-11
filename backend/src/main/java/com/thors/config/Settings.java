package com.thors.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("thors")
public record Settings(
    String frontendUrl, Auth auth, Delivery delivery, Google google, Bootstrap bootstrap) {
  public record Auth(String otpSecret, int otpSeconds, int resendSeconds, int maxSendsPerHour) {}

  public record Delivery(
      boolean emailEnabled,
      String emailFrom,
      boolean smsEnabled,
      String smsAccountSid,
      String smsAuthToken,
      String smsFrom) {}

  public record Google(boolean enabled, String clientId, String clientSecret, String redirectUri) {}

  public record Bootstrap(
      boolean enabled, String name, String email, String phone, String password) {}
}

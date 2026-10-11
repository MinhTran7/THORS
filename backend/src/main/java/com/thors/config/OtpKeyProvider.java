package com.thors.config;

import java.security.SecureRandom;
import java.util.HexFormat;
import org.springframework.stereotype.Component;

@Component
public class OtpKeyProvider {
  private final String value;
  public OtpKeyProvider(Settings settings) {
    String configured=settings.auth().otpSecret();
    if (configured==null || configured.isBlank()) {
      byte[] random=new byte[32];
      new SecureRandom().nextBytes(random);
      value=HexFormat.of().formatHex(random);
    } else {
      if (configured.length()<32)
        throw new IllegalStateException("thors.auth.otp-secret cần ít nhất 32 ký tự; để trống để dùng khóa ngẫu nhiên cho phiên chạy hiện tại.");
      value=configured;
    }
  }
  public String value() { return value; }
}

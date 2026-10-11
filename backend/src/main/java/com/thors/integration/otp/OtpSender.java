package com.thors.integration.otp;

public interface OtpSender {
  void send(String channel, String destination, String code, int seconds);

  boolean available(String channel);
}

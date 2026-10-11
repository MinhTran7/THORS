package com.thors.module.auth.service;

import com.thors.common.ApiException;
import com.thors.config.Settings;
import com.thors.config.OtpKeyProvider;
import com.thors.integration.otp.OtpSender;
import com.thors.module.account.repository.AccountRepository;
import com.thors.module.auth.entity.OtpChallenge;
import com.thors.module.auth.repository.OtpRepository;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.HexFormat;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OtpService {
  private final OtpRepository codes;
  private final AccountRepository users;
  private final OtpSender sender;
  private final Settings settings;
  private final OtpKeyProvider keys;
  private final SecureRandom random = new SecureRandom();

  public OtpService(
      OtpRepository codes, AccountRepository users, OtpSender sender, Settings settings, OtpKeyProvider keys) {
    this.codes = codes;
    this.users = users;
    this.sender = sender;
    this.settings = settings;
    this.keys = keys;
  }

  public record Check(boolean success, String code, String message) {}

  @Transactional
  public OtpChallenge issue(int userId, String context, String channel, boolean requireVerified) {
    if (!"EMAIL".equals(channel) && !"SMS".equals(channel))
      throw new ApiException(400, "CHANNEL", "Chọn email hoặc SMS.");
    var a = users.lock(userId);
    if (!a.active() && !a.pending())
      throw new ApiException(403, "ACCOUNT_BLOCKED", "Tài khoản không thể thực hiện thao tác này.");
    String destination = "EMAIL".equals(channel) ? a.email() : com.thors.common.ContactNormalizer.phone(a.phone());
    if (destination == null || (requireVerified && !a.verified(channel)))
      throw new ApiException(
          400, "CONTACT_UNVERIFIED", "Kênh này chưa được xác minh cho tài khoản.");
    var now = LocalDateTime.now(Clock.systemUTC());
    var last = codes.lastSent(userId);
    if (last != null && last.plusSeconds(settings.auth().resendSeconds()).isAfter(now))
      throw new ApiException(429, "OTP_COOLDOWN", "Vui lòng đợi 60 giây trước khi gửi lại OTP.");
    if (codes.sentLastHour(userId) >= settings.auth().maxSendsPerHour())
      throw new ApiException(429, "OTP_LIMIT", "Đã đạt giới hạn gửi OTP. Vui lòng thử lại sau.");
    if (!sender.available(channel))
      throw new ApiException(503, "DELIVERY_NOT_CONFIGURED", "Kênh gửi OTP chưa được cấu hình.");
    String purpose = context + "_" + channel;
    String value = String.format("%06d", random.nextInt(1000000));
    String token = java.util.UUID.randomUUID().toString();
    String id =
        codes.create(
            userId,
            purpose,
            token,
            hash(userId, purpose, token, value),
            now.plusSeconds(settings.auth().otpSeconds()));
    sender.send(channel, destination, value, settings.auth().otpSeconds());
    return new OtpChallenge(id, userId, purpose, channel, destination, a.authVersion(), context);
  }

  @Transactional
  public Check verify(OtpChallenge challenge, String value) {
    var a = users.lock(challenge.userId());
    var c = codes.lock(challenge.codeId(), challenge.userId(), challenge.purpose());
    String dest = "EMAIL".equals(challenge.channel()) ? a.email() : com.thors.common.ContactNormalizer.phone(a.phone());
    if (c == null
        || c.used()
        || c.attempts() >= 5
        || !c.expires().isAfter(LocalDateTime.now(Clock.systemUTC()))
        || a.authVersion() != challenge.authVersion()
        || !java.util.Objects.equals(dest, challenge.destination()))
      return new Check(false, "OTP_EXPIRED", "Mã đã hết hạn hoặc không còn hiệu lực.");
    if (!a.active() && !a.pending())
      return new Check(false, "ACCOUNT_BLOCKED", "Tài khoản không thể thực hiện thao tác này.");
    if (value == null
        || !MessageDigest.isEqual(
            c.hash().getBytes(StandardCharsets.UTF_8),
            hash(a.id(), challenge.purpose(), challenge.codeId(), value).getBytes(StandardCharsets.UTF_8))) {
      codes.wrong(c);
      return new Check(false, "OTP_INVALID", "Mã OTP không đúng. Tối đa 5 lần thử.");
    }
    codes.used(c);
    if ("REGISTER".equals(challenge.context()) || "ACTIVATE".equals(challenge.context())) {
      users.verify(a.id(), challenge.channel(), true);
      users.audit(a.id(), "ACCOUNT_VERIFIED", a.id(), challenge.channel());
    }
    if ("CONTACT".equals(challenge.context())) users.verify(a.id(), challenge.channel(), false);
    return new Check(true, "OK", "Xác minh thành công.");
  }

  private String hash(int user, String purpose, String token, String code) {
    try {
      Mac m = Mac.getInstance("HmacSHA256");
      m.init(
          new SecretKeySpec(
              keys.value().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
      return HexFormat.of()
          .formatHex(
              m.doFinal((user + ":" + purpose + ":" + token + ":" + code).getBytes(StandardCharsets.UTF_8)));
    } catch (Exception e) {
      throw new IllegalStateException(e);
    }
  }
}

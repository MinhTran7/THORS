package com.thors;

import com.thors.config.OtpKeyProvider;
import com.thors.config.Settings;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class OtpKeyProviderTest {
  Settings settings(String key) {
    return new Settings(null, new Settings.Auth(key, 300, 60, 10), null, null, null);
  }
  @Test void blankKeyCreatesIndependentSecureKeys() {
    var one = new OtpKeyProvider(settings("")).value();
    var two = new OtpKeyProvider(settings("")).value();
    assertTrue(one.matches("[0-9a-f]{64}"));
    assertNotEquals(one, two);
  }
  @Test void configuredKeyRemainsStable() {
    String key = "test-stable-32-character-otp-secret";
    assertEquals(key, new OtpKeyProvider(settings(key)).value());
  }
  @Test void shortConfiguredKeyFailsClearly() {
    assertThrows(IllegalStateException.class, () -> new OtpKeyProvider(settings("short")));
  }
}

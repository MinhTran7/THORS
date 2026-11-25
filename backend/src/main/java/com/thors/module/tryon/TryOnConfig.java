package com.thors.module.tryon;

import java.time.Duration;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Chọn dịch vụ AI thử đồ theo cấu hình (backend/local.properties):
 * <pre>
 *   thors.tryon.provider=mock     # mặc định: ảnh mẫu, không tốn phí, chạy offline
 *   thors.tryon.provider=hf       # miễn phí: Space Hugging Face Leffa, cần hf.token (quyền Read)
 * </pre>
 * Token / khóa API chỉ đặt trong local.properties (đã nằm trong .gitignore), không đưa vào code.
 */
@Configuration
public class TryOnConfig {

    private static final Logger log = LoggerFactory.getLogger(TryOnConfig.class);

    @Bean
    public TryOnProvider tryOnProvider(
            @Value("${thors.tryon.provider:mock}") String provider,
            @Value("${thors.tryon.mock-delay-ms:4000}") long mockDelayMs,
            @Value("${thors.tryon.hf-space:https://franciszzj-leffa.hf.space}") String hfSpace,
            @Value("${hf.token:}") String hfToken,
            @Value("${thors.tryon.hf-timeout-seconds:240}") long hfTimeoutSeconds) {
        String name = provider.trim().toLowerCase(Locale.ROOT);
        if (name.equals("hf")) {
            if (hfToken.isBlank()) log.warn("thors.tryon.provider=hf but hf.token is empty: free GPU quota may refuse requests");
            log.info("Try-on provider: Hugging Face Space {}", hfSpace);
            return new HfLeffaTryOnProvider(hfSpace, hfToken, Duration.ofSeconds(hfTimeoutSeconds));
        }
        if (!name.equals("mock")) log.warn("Unknown thors.tryon.provider '{}', using mock", provider);
        return new MockTryOnProvider(mockDelayMs);
    }
}

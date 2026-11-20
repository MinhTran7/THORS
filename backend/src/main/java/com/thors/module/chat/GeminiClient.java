package com.thors.module.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.http.converter.ByteArrayHttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestTemplate;

/**
 * Gọi Google Gemini API (generateContent) cho trợ lý chat. Cấu hình trong local.properties:
 * thors.ai.gemini-api-key (lấy ở Google AI Studio), thors.ai.gemini-model (mặc định gemini-3.5-flash-lite,
 * có trong gói miễn phí). Chưa có key thì {@link #configured()} = false và trợ lý không chạy.
 *
 * <p>Lưu ý gói miễn phí: Google có thể dùng nội dung gửi lên để cải thiện sản phẩm, nên ChatBot chỉ gửi
 * dữ liệu tối thiểu (không gửi số điện thoại, địa chỉ, email của khách).
 */
@Component
public class GeminiClient {
    private static final Logger log = LoggerFactory.getLogger(GeminiClient.class);

    /** Lỗi khi gọi Gemini; quota = true khi hết hạn mức (HTTP 429). */
    public static class GeminiException extends RuntimeException {
        public final boolean quota;

        GeminiException(String message, boolean quota) {
            super(message);
            this.quota = quota;
        }
    }

    private final RestTemplate http;
    private final ObjectMapper json = new ObjectMapper();
    private final String apiKey;
    private final String model;
    private final String baseUrl;

    public GeminiClient(
            @Value("${thors.ai.gemini-api-key:}") String apiKey,
            @Value("${thors.ai.gemini-model:gemini-3.5-flash-lite}") String model,
            @Value("${thors.ai.gemini-base-url:https://generativelanguage.googleapis.com/v1beta}") String baseUrl) {
        // RestTemplate riêng, gửi / nhận byte UTF-8 thô: không dùng bộ chuyển đổi (Jackson...) Spring gắn vào
        // RestTemplateBuilder, vốn có thể bọc chuỗi JSON thành chuỗi trong ngoặc kép làm Gemini trả lỗi 400.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(40));
        this.http = new RestTemplate(factory);
        this.http.setMessageConverters(List.of(new ByteArrayHttpMessageConverter()));
        this.apiKey = apiKey == null ? "" : apiKey.trim();
        this.model = model == null || model.isBlank() ? "gemini-3.5-flash-lite" : model.trim();
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        if (!configured()) log.info("Chưa cấu hình thors.ai.gemini-api-key: trợ lý AI trong chat tắt");
    }

    public boolean configured() {
        return !apiKey.isEmpty();
    }

    public String model() {
        return model;
    }

    public ObjectMapper json() {
        return json;
    }

    /**
     * Một lượt generateContent. contents: các lượt {role: user|model, parts: [...]}; tools: mảng
     * functionDeclarations. Trả về content của ứng viên đầu tiên (giữ nguyên để gửi lại ở lượt sau, kể cả
     * thoughtSignature của mô hình mới).
     */
    public JsonNode generate(String systemInstruction, ArrayNode contents, ArrayNode functionDeclarations) {
        return generate(systemInstruction, contents, functionDeclarations, true);
    }

    /** allowTools = false: vẫn khai báo công cụ (lịch sử có lượt gọi công cụ) nhưng buộc mô hình trả lời bằng chữ. */
    public JsonNode generate(String systemInstruction, ArrayNode contents, ArrayNode functionDeclarations, boolean allowTools) {
        if (!configured()) throw new GeminiException("Chưa cấu hình Gemini API key.", false);
        ObjectNode body = json.createObjectNode();
        body.putObject("systemInstruction").putArray("parts").addObject().put("text", systemInstruction);
        body.set("contents", contents);
        if (functionDeclarations != null && !functionDeclarations.isEmpty()) {
            body.putArray("tools").addObject().set("functionDeclarations", functionDeclarations);
            body.putObject("toolConfig").putObject("functionCallingConfig").put("mode", allowTools ? "AUTO" : "NONE");
        }
        body.putObject("generationConfig").put("temperature", 0.3).put("maxOutputTokens", 800);

        HttpHeaders headers = new HttpHeaders();
        // Ghi rõ UTF-8 để chữ tiếng Việt không bị đổi thành '?' khi gửi chuỗi JSON
        headers.setContentType(new MediaType("application", "json", StandardCharsets.UTF_8));
        headers.setAccept(List.of(MediaType.APPLICATION_JSON));
        headers.set("x-goog-api-key", apiKey);
        String url = baseUrl + "/models/" + model + ":generateContent";
        String raw;
        try {
            byte[] response = http.postForObject(url, new HttpEntity<>(body.toString().getBytes(StandardCharsets.UTF_8), headers), byte[].class);
            raw = response == null ? "" : new String(response, StandardCharsets.UTF_8);
        } catch (HttpStatusCodeException e) {
            int status = e.getStatusCode().value();
            String detail = shorten(e.getResponseBodyAsString());
            log.warn("Gemini lỗi HTTP {}: {}", status, detail);
            String message = "";
            try {
                message = json.readTree(e.getResponseBodyAsString()).path("error").path("message").asText("");
            } catch (Exception ignored) {
                // không đọc được nội dung lỗi thì chỉ báo mã HTTP
            }
            throw new GeminiException("Gemini trả lỗi HTTP " + status + (message.isEmpty() ? "" : ": " + shorten(message)), status == 429);
        } catch (RestClientException e) {
            log.warn("Không kết nối được Gemini: {}", e.toString());
            throw new GeminiException("Không kết nối được Gemini (" + e.getClass().getSimpleName() + ").", false);
        }
        try {
            JsonNode root = json.readTree(raw == null ? "" : raw);
            JsonNode candidate = root.path("candidates").path(0);
            JsonNode content = candidate.path("content");
            if (content.isMissingNode() || !content.path("parts").isArray() || content.path("parts").isEmpty()) {
                log.warn("Gemini không trả nội dung (finishReason={})", candidate.path("finishReason").asText("?"));
                throw new GeminiException("Gemini không trả nội dung.", false);
            }
            return content;
        } catch (GeminiException e) {
            throw e;
        } catch (Exception e) {
            throw new GeminiException("Không đọc được trả lời của Gemini.", false);
        }
    }

    private static String shorten(String s) {
        if (s == null) return "";
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }
}

package com.thors.module.tryon;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.thors.module.tryon.TryOnPlan.Garment;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Dịch vụ AI miễn phí: Space Hugging Face "Leffa" (franciszzj/Leffa, giấy phép MIT) qua Gradio API.
 * Dùng GPU miễn phí (ZeroGPU) của Hugging Face theo token của tài khoản (hf.token) - tài khoản free
 * chỉ được vài lượt / ngày, có lúc phải xếp hàng hoặc Space tạm dừng. Hợp với đồ án / demo.
 *
 * <p>Luồng Gradio: tải 2 ảnh lên Space (/gradio_api/upload) -> gọi /gradio_api/call/leffa_predict_vt nhận event_id
 * -> đọc luồng kết quả (server-sent events) tới khi "complete" -> tải ảnh kết quả về.
 *
 * <p>Leffa chỉ thay đồ trên ảnh người có sẵn, KHÔNG tự tạo người mẫu -> chế độ GENERATE không hỗ trợ.
 */
public class HfLeffaTryOnProvider implements TryOnProvider {

    private static final Logger log = LoggerFactory.getLogger(HfLeffaTryOnProvider.class);
    private static final String API = "leffa_predict_vt";
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String space;
    private final String token;
    private final Duration timeout;
    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(20))
            .followRedirects(HttpClient.Redirect.NORMAL)
            .build();

    /**
     * @param space địa chỉ Space, vd https://franciszzj-leffa.hf.space
     * @param token token Hugging Face (quyền Read) - lấy từ local.properties, không ghi vào code / log
     */
    public HfLeffaTryOnProvider(String space, String token, Duration timeout) {
        this.space = space.replaceAll("/+$", "");
        this.token = token == null ? "" : token.trim();
        this.timeout = timeout;
    }

    @Override
    public String name() {
        return "HF_LEFFA";
    }

    @Override
    public Image apply(String personImageUrl, String garmentImageUrl, Garment garment) {
        try {
            List<String> paths = upload(download(personImageUrl), download(garmentImageUrl));
            // Áo: mô hình viton_hd; quần / đầm: mô hình dress_code (Leffa khuyên dùng cho 2 loại này)
            String model = garment == Garment.TOP ? "viton_hd" : "dress_code";
            String type = switch (garment) {
                case TOP -> "upper_body";
                case BOTTOM -> "lower_body";
                case DRESS -> "dresses";
            };
            // ref_acceleration / repaint là boolean thật (trang mô tả API ghi 'True'/'False' nhưng Space chỉ nhận true/false)
            List<Object> data = List.of(file(paths.get(0)), file(paths.get(1)), false, 30, 2.5, 42, model, type, false);
            String eventId = call(data);
            JsonNode result = await(eventId);
            JsonNode out = result.path(0);
            String url = out.path("url").asText(null);
            if (url == null || url.isBlank()) url = space + "/gradio_api/file=" + out.path("path").asText();
            return Image.ofBytes(download(url));
        } catch (TryOnException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new TryOnException("Đã dừng xử lý.", e);
        } catch (Exception e) {
            log.warn("HF Leffa try-on failed: {}", e.toString());
            throw new TryOnException("Dịch vụ AI miễn phí đang lỗi, vui lòng thử lại sau.", e);
        }
    }

    @Override
    public boolean supportsGenerate() {
        return false;
    }

    @Override
    public Image generate(String garmentImageUrl, Garment garment, String personDescription) {
        throw new TryOnException("Dịch vụ AI miễn phí chưa hỗ trợ tự tạo người mẫu. "
                + "Hãy chọn \"Người mẫu dáng giống bạn\" hoặc \"Ảnh của tôi\".");
    }

    // ---------------------------------------------------------------- Gradio

    private static Map<String, Object> file(String path) {
        return Map.of("path", path, "meta", Map.of("_type", "gradio.FileData"));
    }

    /** Tải 2 ảnh lên Space (multipart), trả đường dẫn tạm trên Space. */
    private List<String> upload(byte[] person, byte[] garment) throws IOException, InterruptedException {
        String boundary = "----thors" + UUID.randomUUID().toString().replace("-", "");
        ByteArrayOutputStream body = new ByteArrayOutputStream();
        part(body, boundary, "person.jpg", person);
        part(body, boundary, "garment.jpg", garment);
        body.write(("--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
        HttpResponse<String> res = http.send(request("/gradio_api/upload")
                .header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body.toByteArray()))
                .timeout(Duration.ofSeconds(60))
                .build(), HttpResponse.BodyHandlers.ofString());
        check(res);
        JsonNode paths = JSON.readTree(res.body());
        if (!paths.isArray() || paths.size() < 2) throw new IOException("upload: " + res.body());
        return List.of(paths.get(0).asText(), paths.get(1).asText());
    }

    private static void part(ByteArrayOutputStream body, String boundary, String name, byte[] bytes) throws IOException {
        body.write(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"files\"; filename=\"" + name
                + "\"\r\nContent-Type: image/jpeg\r\n\r\n").getBytes(StandardCharsets.UTF_8));
        body.write(bytes);
        body.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private String call(List<Object> data) throws IOException, InterruptedException {
        HttpResponse<String> res = http.send(request("/gradio_api/call/" + API)
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(Map.of("data", data))))
                .timeout(Duration.ofSeconds(30))
                .build(), HttpResponse.BodyHandlers.ofString());
        check(res);
        String id = JSON.readTree(res.body()).path("event_id").asText("");
        if (id.isBlank()) throw new IOException("no event_id: " + res.body());
        return id;
    }

    /** Đọc luồng sự kiện tới khi xong: "event: complete" + "data: [...]" hoặc "event: error". */
    private JsonNode await(String eventId) throws IOException, InterruptedException {
        HttpResponse<java.io.InputStream> res = http.send(request("/gradio_api/call/" + API + "/" + eventId)
                .GET().timeout(timeout).build(), HttpResponse.BodyHandlers.ofInputStream());
        if (res.statusCode() >= 400) throw new IOException("stream HTTP " + res.statusCode());
        try (BufferedReader in = new BufferedReader(new InputStreamReader(res.body(), StandardCharsets.UTF_8))) {
            String event = null;
            String line;
            while ((line = in.readLine()) != null) {
                if (line.startsWith("event:")) {
                    event = line.substring(6).trim();
                } else if (line.startsWith("data:")) {
                    String data = line.substring(5).trim();
                    if ("complete".equals(event)) return JSON.readTree(data);
                    if ("error".equals(event)) {
                        log.info("HF Leffa returned error event: {}", data);
                        throw new TryOnException("Dịch vụ AI miễn phí đang bận hoặc đã hết lượt hôm nay. Vui lòng thử lại sau.");
                    }
                }
            }
        }
        throw new TryOnException("Dịch vụ AI miễn phí không trả kết quả, vui lòng thử lại sau.");
    }

    private HttpRequest.Builder request(String path) {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(space + path));
        if (!token.isEmpty()) b.header("Authorization", "Bearer " + token);
        return b;
    }

    private byte[] download(String url) throws IOException, InterruptedException {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(url)).GET().timeout(Duration.ofSeconds(60));
        // Chỉ gửi token cho chính Space (không gửi cho Cloudinary / trang khác)
        if (!token.isEmpty() && url.startsWith(space)) b.header("Authorization", "Bearer " + token);
        HttpResponse<byte[]> res = http.send(b.build(), HttpResponse.BodyHandlers.ofByteArray());
        if (res.statusCode() >= 400) throw new IOException("download HTTP " + res.statusCode());
        return res.body();
    }

    private static void check(HttpResponse<String> res) throws IOException {
        if (res.statusCode() == 401 || res.statusCode() == 403) {
            throw new TryOnException("Token Hugging Face không hợp lệ (kiểm tra hf.token).");
        }
        if (res.statusCode() == 429) {
            throw new TryOnException("Dịch vụ AI miễn phí đã hết lượt hôm nay. Vui lòng thử lại sau.");
        }
        if (res.statusCode() >= 400) throw new IOException("HTTP " + res.statusCode());
    }
}

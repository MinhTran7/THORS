package com.thors.module.imagesearch.model;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;

/** Tải file mô hình về thư mục cache một lần, kiểm tra SHA-256 rồi mới dùng. */
public final class ModelFiles {

    private static final Logger log = LoggerFactory.getLogger(ModelFiles.class);

    private ModelFiles() {}

    /** Trả về đường dẫn file mô hình đã kiểm tra; tải về nếu chưa có hoặc file cũ bị hỏng. */
    public static Path ensureModel(Path dir, String url, String sha256) throws IOException {
        Files.createDirectories(dir);
        Path target = dir.resolve("siglip-b16-vision-fp16.onnx");
        if (Files.exists(target)) {
            if (sha256 == null || sha256.isBlank() || sha256.equalsIgnoreCase(sha256Of(target))) {
                return target;
            }
            log.warn("File mô hình {} không đúng SHA-256, tải lại.", target);
        }
        log.info("Đang tải mô hình tìm ảnh (~180 MB) từ {} ...", url);
        Path tmp = Files.createTempFile(dir, "model-", ".part");
        try {
            HttpClient client = HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .connectTimeout(Duration.ofSeconds(30))
                    .build();
            HttpRequest request = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofMinutes(30)).GET().build();
            HttpResponse<InputStream> response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            if (response.statusCode() != 200) {
                response.body().close();
                throw new IOException("Tải mô hình lỗi HTTP " + response.statusCode());
            }
            MessageDigest digest = sha256();
            try (InputStream in = new DigestInputStream(response.body(), digest);
                 OutputStream out = Files.newOutputStream(tmp)) {
                in.transferTo(out);
            }
            String actual = HexFormat.of().formatHex(digest.digest());
            if (sha256 != null && !sha256.isBlank() && !sha256.equalsIgnoreCase(actual)) {
                throw new IOException("File mô hình tải về sai SHA-256 (" + actual + ")");
            }
            Files.move(tmp, target, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
            log.info("Đã tải xong mô hình: {}", target);
            return target;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("Bị dừng khi đang tải mô hình", e);
        } finally {
            Files.deleteIfExists(tmp);
        }
    }

    static String sha256Of(Path file) throws IOException {
        MessageDigest digest = sha256();
        try (InputStream in = new DigestInputStream(Files.newInputStream(file), digest)) {
            in.transferTo(OutputStream.nullOutputStream());
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private static MessageDigest sha256() {
        try {
            return MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }
}

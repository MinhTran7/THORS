package com.thors.module.warehouse;

import com.thors.common.ApiException;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import javax.imageio.ImageIO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.*;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

@Service
public class WarehousePhotos {
    private final Path root;

    public WarehousePhotos(
            @Value("${thors.warehouse.photo-directory:./data/warehouse-photos}") String directory) {
        root = Path.of(directory).toAbsolutePath().normalize();
    }

    public Map<String, String> upload(MultipartFile file) {
        if (file.isEmpty() || file.getSize() > 5 * 1024 * 1024)
            throw new ApiException(400, "PHOTO_SIZE", "Ảnh JPG/PNG tối đa 5 MB.");
        try {
            byte[] bytes = file.getBytes();
            String ext;
            try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers = ImageIO.getImageReaders(input);
                if (!readers.hasNext()) throw new IOException("image");
                var reader = readers.next();
                try {
                    reader.setInput(input);
                    String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                    if (!Set.of("jpeg", "jpg", "png").contains(format)) throw new IOException("format");
                    long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                    if (pixels <= 0 || pixels > 20000000) throw new IOException("dimensions");
                    ext = format.equals("png") ? "png" : "jpg";
                    // Fully decode once to reject malformed image payloads.
                    if (reader.read(0) == null) throw new IOException("decode");
                } finally {
                    reader.dispose();
                }
            }
            Files.createDirectories(root);
            String key = UUID.randomUUID().toString().replace("-", "") + "." + ext;
            Files.write(root.resolve(key), bytes, StandardOpenOption.CREATE_NEW);
            return Map.of("key", key, "url", "/api/warehouse/photos/" + key);
        } catch (IOException e) {
            throw new ApiException(
                    400, "PHOTO_INVALID", "Không lưu được ảnh. Kiểm tra ảnh JPG/PNG và thư mục lưu ảnh.");
        }
    }

    public Path existing(String key) {
        if (key == null || !key.matches("[a-f0-9]{32}\\.(jpg|png|webp)"))
            throw new ApiException(404, "PHOTO_NOT_FOUND", "Không tìm thấy ảnh.");
        Path path = root.resolve(key).normalize();
        if (!path.startsWith(root) || !Files.isRegularFile(path) || Files.isSymbolicLink(path))
            throw new ApiException(404, "PHOTO_NOT_FOUND", "Không tìm thấy ảnh.");
        return path;
    }

    public Resource resource(String key) {
        return new FileSystemResource(existing(key));
    }
}

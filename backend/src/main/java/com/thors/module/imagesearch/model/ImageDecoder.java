package com.thors.module.imagesearch.model;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.Iterator;

/**
 * Đọc ảnh JPG / PNG / WEBP / GIF / BMP từ byte. WEBP nhờ thư viện TwelveMonkeys (tự đăng ký vào ImageIO).
 * Đọc kích thước trước khi giải mã để từ chối ảnh quá lớn (tránh ảnh "bom" làm hết bộ nhớ).
 */
public final class ImageDecoder {

    /** 40 triệu điểm ảnh (vd 8000 x 5000) là đủ cho mọi ảnh điện thoại. */
    public static final long MAX_PIXELS = 40_000_000L;

    private ImageDecoder() {}

    public static BufferedImage decode(byte[] bytes) throws IOException {
        try (ImageInputStream in = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            if (in == null) {
                throw new IOException("Không đọc được ảnh.");
            }
            Iterator<ImageReader> readers = ImageIO.getImageReaders(in);
            if (!readers.hasNext()) {
                throw new IOException("Định dạng ảnh không được hỗ trợ.");
            }
            ImageReader reader = readers.next();
            try {
                reader.setInput(in, true, true);
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels <= 0 || pixels > MAX_PIXELS) {
                    throw new IOException("Ảnh quá lớn.");
                }
                BufferedImage image = reader.read(0);
                if (image == null) {
                    throw new IOException("Không đọc được ảnh.");
                }
                return image;
            } finally {
                reader.dispose();
            }
        }
    }
}

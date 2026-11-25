package com.thors.module.tryon;

import com.thors.module.tryon.TryOnPlan.Garment;
import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLConnection;
import javax.imageio.ImageIO;

/**
 * Dịch vụ "giả" khi chưa cấu hình AI thật (thors.tryon.provider=mock, mặc định): không tốn phí, chạy offline.
 * Trả về ảnh của khách + ảnh món đồ ở góc + nhãn "ẢNH MẪU" để thấy rõ luồng job hoạt động
 * (dùng khi lập trình, kiểm thử và làm phương án dự phòng khi demo mất mạng / hết credit).
 */
public class MockTryOnProvider implements TryOnProvider {

    private static final int TIMEOUT_MS = 15_000;
    private final long delayMs;

    public MockTryOnProvider(long delayMs) {
        this.delayMs = delayMs;
    }

    @Override
    public String name() {
        return "MOCK";
    }

    @Override
    public Image apply(String personImageUrl, String garmentImageUrl, Garment garment) {
        try {
            Thread.sleep(delayMs); // giả lập thời gian AI xử lý
            BufferedImage person = read(personImageUrl);
            BufferedImage garmentImg = read(garmentImageUrl);
            BufferedImage out = new BufferedImage(person.getWidth(), person.getHeight(), BufferedImage.TYPE_INT_RGB);
            Graphics2D g = out.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
            g.drawImage(person, 0, 0, null);

            // Ảnh món đồ ở góc dưới bên phải
            int w = Math.max(80, person.getWidth() / 3);
            int h = garmentImg.getHeight() * w / Math.max(1, garmentImg.getWidth());
            int x = person.getWidth() - w - 16;
            int y = person.getHeight() - h - 16;
            g.setColor(Color.WHITE);
            g.fillRect(x - 6, y - 6, w + 12, h + 12);
            g.drawImage(garmentImg, x, y, w, h, null);
            g.setColor(new Color(0, 0, 0, 90));
            g.setStroke(new BasicStroke(2));
            g.drawRect(x - 6, y - 6, w + 12, h + 12);

            // Nhãn
            int fontSize = Math.max(16, person.getWidth() / 22);
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, fontSize));
            String label = "ẢNH MẪU - chưa bật AI thử đồ";
            int tw = g.getFontMetrics().stringWidth(label);
            g.setColor(new Color(0, 0, 0, 150));
            g.fillRect(0, 0, person.getWidth(), fontSize * 2);
            g.setColor(Color.WHITE);
            g.drawString(label, (person.getWidth() - tw) / 2, (int) (fontSize * 1.4));
            g.dispose();

            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            ImageIO.write(out, "jpg", bytes);
            return Image.ofBytes(bytes.toByteArray());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new TryOnException("Đã dừng xử lý.", e);
        } catch (IOException | RuntimeException e) {
            throw new TryOnException("Không đọc được ảnh để mặc thử.", e);
        }
    }

    /** Ảnh mẫu cho chế độ "AI tạo người mẫu": nền sáng + ảnh món đồ + mô tả người mẫu sẽ được tạo. */
    @Override
    public Image generate(String garmentImageUrl, Garment garment, String personDescription) {
        try {
            Thread.sleep(delayMs);
            BufferedImage garmentImg = read(garmentImageUrl);
            int w = 768;
            int h = 1024;
            BufferedImage out = new BufferedImage(w, h, BufferedImage.TYPE_INT_RGB);
            Graphics2D g = out.createGraphics();
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
            g.setColor(new Color(0xF2, 0xEE, 0xE8));
            g.fillRect(0, 0, w, h);
            int gw = 480;
            int gh = Math.min(640, garmentImg.getHeight() * gw / Math.max(1, garmentImg.getWidth()));
            g.drawImage(garmentImg, (w - gw) / 2, 160, gw, gh, null);
            g.setColor(new Color(0x11, 0x11, 0x11));
            g.setFont(new Font(Font.SANS_SERIF, Font.BOLD, 34));
            drawCentered(g, "ẢNH MẪU - AI tạo người mẫu", w, 90);
            g.setFont(new Font(Font.SANS_SERIF, Font.PLAIN, 20));
            int y = 160 + gh + 60;
            for (String line : wrap(personDescription, 52)) {
                drawCentered(g, line, w, y);
                y += 30;
            }
            g.dispose();
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            ImageIO.write(out, "jpg", bytes);
            return Image.ofBytes(bytes.toByteArray());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new TryOnException("Đã dừng xử lý.", e);
        } catch (IOException | RuntimeException e) {
            throw new TryOnException("Không đọc được ảnh sản phẩm.", e);
        }
    }

    private static void drawCentered(Graphics2D g, String text, int width, int y) {
        g.drawString(text, (width - g.getFontMetrics().stringWidth(text)) / 2, y);
    }

    private static java.util.List<String> wrap(String text, int max) {
        java.util.List<String> lines = new java.util.ArrayList<>();
        StringBuilder line = new StringBuilder();
        for (String word : String.valueOf(text).split(" ")) {
            if (line.length() + word.length() + 1 > max && line.length() > 0) {
                lines.add(line.toString());
                line.setLength(0);
            }
            if (line.length() > 0) line.append(' ');
            line.append(word);
        }
        if (line.length() > 0) lines.add(line.toString());
        return lines;
    }

    private static BufferedImage read(String url) throws IOException {
        URLConnection c = URI.create(url).toURL().openConnection();
        c.setConnectTimeout(TIMEOUT_MS);
        c.setReadTimeout(TIMEOUT_MS);
        try (InputStream in = c.getInputStream()) {
            BufferedImage img = ImageIO.read(in);
            if (img == null) throw new IOException("not an image: " + url);
            return img;
        }
    }
}

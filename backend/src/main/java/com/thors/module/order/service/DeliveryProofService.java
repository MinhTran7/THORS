package com.thors.module.order.service;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.order.delivery.GhnShippingService;
import com.thors.module.order.dto.OrderViews.Detail;
import com.thors.module.order.repository.DeliveryProofRepository;
import com.thors.module.order.repository.DeliveryProofRepository.Proof;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Minh chứng giao hàng: đơn cửa hàng tự giao chỉ được chuyển sang "Đã giao"
 * khi người giao tải lên 1–{@value #MAX_IMAGES} ảnh lúc giao, kèm ghi chú tùy chọn. Đơn GHN không qua đây
 * vì GHN tự báo đã giao.
 *
 * <p>Chỉ bắt buộc khi database đã chạy migration 2026-11-13_order_delivery_proof.sql; chưa chạy thì luồng
 * "Xác nhận đã giao" giữ như cũ để không chặn việc của cả nhóm trên database chung.
 */
@Service
public class DeliveryProofService {
    static final int MAX_IMAGES = 3;
    static final long MAX_BYTES = 5 * 1024 * 1024;
    static final int MAX_NOTE = 255;
    static final String FOLDER = "thors/delivery-proofs";
    private static final long MAX_PIXELS = 20_000_000;
    private static final Logger log = LoggerFactory.getLogger(DeliveryProofService.class);

    private final DeliveryProofRepository proofs;
    private final OrderService orders;
    private final Cloudinary cloudinary;

    public DeliveryProofService(DeliveryProofRepository proofs, OrderService orders, Cloudinary cloudinary) {
        this.proofs = proofs;
        this.orders = orders;
        this.cloudinary = cloudinary;
    }

    /** true nếu bấm "Xác nhận đã giao" phải kèm ảnh minh chứng (database đã có bảng). */
    public boolean required() {
        return proofs.ready();
    }

    /**
     * Chặn đường đổi trạng thái thường (POST /status) sang DELIVERED khi đã bắt buộc minh chứng, để không
     * ai bỏ qua bước tải ảnh.
     */
    public void guardStatusChange(String target) {
        if (OrderStatus.DELIVERED.equals(target) && required())
            throw new ApiException(
                    400, "DELIVERY_PROOF_REQUIRED", "Cần tải ảnh minh chứng giao hàng trước khi xác nhận đã giao.");
    }

    /**
     * Owner xác nhận đã giao kèm ảnh: kiểm tra đơn và ảnh trước, đẩy ảnh lên Cloudinary, rồi đổi trạng thái
     * và lưu minh chứng trong cùng một giao dịch. Lỗi ở bước sau thì xóa ảnh vừa đẩy lên.
     */
    @Transactional
    public Map<String, Object> confirmDelivered(Account actor, int orderId, List<MultipartFile> images, String note) {
        if (!Set.of("OWNER", "FAMILY_MEMBER").contains(actor.role()))
            throw new ApiException(403, "ROLE", "Chỉ chủ shop và người nhà được xử lý đơn hàng online.");
        if (!required())
            throw new ApiException(
                    409,
                    "DELIVERY_PROOF_UNAVAILABLE",
                    "Database chưa chạy migration 2026-11-13_order_delivery_proof.sql nên chưa lưu được ảnh minh chứng.");

        // Kiểm tra đơn trước khi đẩy ảnh, để không tải ảnh lên vô ích
        Detail order = orders.detail(actor, orderId);
        if (!OrderStatus.SHIPPING.equals(order.orderStatus()))
            throw new ApiException(409, "ORDER_TRANSITION", "Chỉ xác nhận đã giao được khi đơn đang giao.");
        if (order.shipment() != null && GhnShippingService.CARRIER.equals(order.shipment().carrier()))
            throw new ApiException(
                    409, "CARRIER_MANAGED", "Đơn đã gửi GHN sẽ tự chuyển trạng thái khi GHN giao thành công.");

        String safeNote = note == null || note.isBlank() ? null : note.trim();
        if (safeNote != null && safeNote.length() > MAX_NOTE)
            throw new ApiException(400, "NOTE", "Ghi chú quá dài (tối đa " + MAX_NOTE + " ký tự).");
        List<byte[]> files = readImages(images);

        List<String> urls = new ArrayList<>();
        try {
            for (byte[] bytes : files) urls.add(upload(orderId, bytes));
            Detail delivered = orders.changeStatus(actor, orderId, OrderStatus.DELIVERED, null, null, null, null, null);
            proofs.insert(orderId, urls, safeNote, actor.id());
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("order", delivered);
            result.put("proof", proofs.find(orderId).orElse(null));
            return result;
        } catch (RuntimeException e) {
            // Đơn không đổi được trạng thái hoặc không lưu được minh chứng: ảnh đã đẩy lên là rác
            destroy(urls);
            throw e;
        }
    }

    /**
     * Minh chứng của một đơn, kèm cờ required để giao diện biết có cần hộp thoại tải ảnh không. Quyền xem
     * giống chi tiết đơn (khách chỉ xem đơn của mình); khách không thấy tên nhân viên đã giao.
     */
    public Map<String, Object> view(Account actor, int orderId) {
        orders.detail(actor, orderId);
        Proof proof = proofs.find(orderId).orElse(null);
        if (proof != null && "CUSTOMER".equals(actor.role()))
            proof = new Proof(proof.imageUrls(), proof.note(), proof.createdAt(), null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("required", required());
        result.put("proof", proof);
        return result;
    }

    private static List<byte[]> readImages(List<MultipartFile> images) {
        List<MultipartFile> present =
                images == null ? List.of() : images.stream().filter(f -> f != null && !f.isEmpty()).toList();
        if (present.isEmpty())
            throw new ApiException(400, "DELIVERY_PROOF_REQUIRED", "Vui lòng chụp ít nhất 1 ảnh lúc giao hàng.");
        if (present.size() > MAX_IMAGES)
            throw new ApiException(400, "DELIVERY_PROOF_COUNT", "Tối đa " + MAX_IMAGES + " ảnh minh chứng.");
        List<byte[]> result = new ArrayList<>();
        for (MultipartFile file : present) {
            if (file.getSize() > MAX_BYTES)
                throw new ApiException(400, "DELIVERY_PROOF_SIZE", "Mỗi ảnh tối đa 5 MB.");
            try {
                byte[] bytes = file.getBytes();
                checkImage(bytes);
                result.add(bytes);
            } catch (IOException e) {
                throw new ApiException(400, "DELIVERY_PROOF_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.");
            }
        }
        return result;
    }

    /** Kiểm tra nội dung thật là JPG/PNG giải mã được, không tin Content-Type do client gửi. */
    private static void checkImage(byte[] bytes) {
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new IOException("not an image");
            var reader = readers.next();
            try {
                reader.setInput(input);
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!Set.of("jpeg", "jpg", "png").contains(format)) throw new IOException("format");
                long pixels = (long) reader.getWidth(0) * reader.getHeight(0);
                if (pixels <= 0 || pixels > MAX_PIXELS) throw new IOException("dimensions");
                if (reader.read(0) == null) throw new IOException("decode");
            } finally {
                reader.dispose();
            }
        } catch (IOException | RuntimeException e) {
            throw new ApiException(400, "DELIVERY_PROOF_INVALID", "Chỉ nhận ảnh JPG hoặc PNG hợp lệ.");
        }
    }

    private String upload(int orderId, byte[] bytes) {
        Map<?, ?> result;
        try {
            result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                    "folder", FOLDER,
                    "public_id", "o" + orderId + "_" + UUID.randomUUID().toString().replace("-", ""),
                    "overwrite", false,
                    "resource_type", "image"));
        } catch (Exception e) {
            throw new ApiException(502, "DELIVERY_PROOF_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.");
        }
        Object url = result == null ? null : result.get("secure_url");
        if (url == null || !url.toString().startsWith("https://"))
            throw new ApiException(502, "DELIVERY_PROOF_UPLOAD", "Không tải được ảnh lên. Vui lòng thử lại.");
        return url.toString();
    }

    /** Xóa ảnh vừa đẩy lên khi thao tác thất bại; lỗi chỉ ghi log để không che lỗi gốc. */
    private void destroy(List<String> urls) {
        for (String url : urls) {
            int at = url.indexOf("/" + FOLDER + "/");
            if (at < 0) continue;
            String publicId = url.substring(at + 1).replaceFirst("\\.[a-zA-Z0-9]+$", "");
            try {
                cloudinary.uploader().destroy(publicId, ObjectUtils.asMap("resource_type", "image", "invalidate", true));
            } catch (Exception e) {
                log.warn("Could not delete delivery proof image {}: {}", publicId, e.toString());
            }
        }
    }
}

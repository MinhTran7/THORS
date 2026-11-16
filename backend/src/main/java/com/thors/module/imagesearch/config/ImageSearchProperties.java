package com.thors.module.imagesearch.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.nio.file.Path;

/**
 * Cấu hình tính năng "Chụp ảnh tìm sản phẩm" (thors.image-search.*).
 *
 * Mô hình: SigLIP base patch16-224 (Google), bản ONNX fp16. Được chọn sau 4 lần đánh giá ngày 12-15/11/2026
 * (xem báo cáo BAO_CAO_TEST_AI_CHUP_ANH.xlsx): đúng hạng 1 cả 49/49 ảnh, tìm thấy 46/49, nhận màu đúng nhóm 57/64.
 * Các ngưỡng mặc định dưới đây lấy từ báo cáo đó; đổi mô hình thì phải đánh giá lại ngưỡng.
 */
@Configuration
@ConfigurationProperties(prefix = "thors.image-search")
public class ImageSearchProperties {

    /** Tắt mặc định: bật sẽ tải mô hình ~180 MB về máy và tốn ~400 MB RAM. */
    private boolean enabled = false;

    /** Nơi tải file mô hình ONNX (đã ghim đúng phiên bản trên Hugging Face). */
    private String modelUrl = "https://huggingface.co/Xenova/siglip-base-patch16-224/resolve/"
            + "4649052661e53c7000355844105f8a1792088239/onnx/vision_model_fp16.onnx";

    /** SHA-256 của file mô hình, để chắc tải về không bị hỏng hay bị thay. */
    private String modelSha256 = "7287a8e9cbf4f2eedd66e8dc5cf584be03108f4e4a24331879ac6ef7ac7c878f";

    /** Thư mục lưu file mô hình và vector ảnh sản phẩm đã tính (để khởi động lại không phải tính lại). */
    private String cacheDir = Path.of(System.getProperty("user.home"), ".thors", "image-search").toString();

    /**
     * Điểm giống tối thiểu để coi là "giống" sản phẩm của shop (cách A trong báo cáo lần 4). Từ mức này đến
     * confidentThreshold chỉ nói "có sản phẩm khá giống", không khẳng định cùng mẫu.
     */
    private double matchThreshold = 0.808;

    /**
     * Điểm giống tối thiểu để KHẲNG ĐỊNH "shop có mẫu này" (kèm màu / tồn kho). Số liệu lần 4: với 0,85 không còn ảnh
     * đồ không bán nào bị khẳng định nhầm (dép xám trơn dep1 = 0,834 trước đây bị nói là "có mẫu" Dép Bánh Mì).
     */
    private double confidentThreshold = 0.85;

    /** Chỉ kết luận "không có màu này" khi AI chắc về màu ít nhất mức này (xác suất 0..1). */
    private double colorConfidence = 0.6;

    /** Số sản phẩm gợi ý luôn trả về (báo cáo: luôn hiện 3-5 gợi ý vì hạng 1 đúng 93% kể cả ảnh mờ). */
    private int suggestions = 5;

    /**
     * Chu kỳ đọc lại danh sách ảnh sản phẩm (phút): sản phẩm / ảnh mới được đưa vào so sánh chậm nhất sau khoảng
     * chu kỳ này + 30 giây. Mỗi lần chỉ là 1 câu SELECT + tính vector cho ảnh mới (~0,35 giây/ảnh) nên đặt ngắn vẫn nhẹ.
     */
    private int refreshMinutes = 2;

    /** Số lượt tìm chạy cùng lúc tối đa; quá thì trả lỗi "đang bận" để máy chủ không bị quá tải. */
    private int maxConcurrentSearches = 4;

    /** Dung lượng ảnh khách gửi lên tối đa. */
    private long maxUploadBytes = 8L * 1024 * 1024;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getModelUrl() { return modelUrl; }
    public void setModelUrl(String modelUrl) { this.modelUrl = modelUrl; }
    public String getModelSha256() { return modelSha256; }
    public void setModelSha256(String modelSha256) { this.modelSha256 = modelSha256; }
    public String getCacheDir() { return cacheDir; }
    public void setCacheDir(String cacheDir) { this.cacheDir = cacheDir; }
    public double getMatchThreshold() { return matchThreshold; }
    public void setMatchThreshold(double matchThreshold) { this.matchThreshold = matchThreshold; }
    public double getConfidentThreshold() { return confidentThreshold; }
    public void setConfidentThreshold(double confidentThreshold) { this.confidentThreshold = confidentThreshold; }
    public double getColorConfidence() { return colorConfidence; }
    public void setColorConfidence(double colorConfidence) { this.colorConfidence = colorConfidence; }
    public int getSuggestions() { return suggestions; }
    public void setSuggestions(int suggestions) { this.suggestions = suggestions; }
    public int getRefreshMinutes() { return refreshMinutes; }
    public void setRefreshMinutes(int refreshMinutes) { this.refreshMinutes = refreshMinutes; }
    public int getMaxConcurrentSearches() { return maxConcurrentSearches; }
    public void setMaxConcurrentSearches(int maxConcurrentSearches) { this.maxConcurrentSearches = maxConcurrentSearches; }
    public long getMaxUploadBytes() { return maxUploadBytes; }
    public void setMaxUploadBytes(long maxUploadBytes) { this.maxUploadBytes = maxUploadBytes; }
}

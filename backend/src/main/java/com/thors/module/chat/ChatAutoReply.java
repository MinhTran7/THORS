package com.thors.module.chat;

import com.thors.module.website.WebsiteSettingRepository;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

/**
 * Cài đặt tin nhắn tự động của chat, chủ shop sửa ở trang Tin nhắn > Cài đặt (GET/PUT /api/chat/settings):
 * tin chào, giờ làm việc + tin ngoài giờ, mẫu câu trả lời nhanh, câu hỏi thường gặp.
 *
 * <p>Lưu trong bảng khóa - giá trị website_setting có sẵn (các khóa bắt đầu bằng "chat"), nên không cần bảng
 * mới. Khóa chưa lưu thì dùng giá trị mặc định bên dưới; lưu chuỗi rỗng = tắt mục đó.
 */
@Component
public class ChatAutoReply {
    static final ZoneId VN = ZoneId.of("Asia/Ho_Chi_Minh");

    /** Id của câu hỏi có sẵn "Đơn của tôi tới đâu rồi?": trả lời bằng trạng thái các đơn đang xử lý của khách. */
    public static final String ORDER_STATUS_FAQ = "orders";

    static final Map<String, String> DEFAULTS =
            Map.of(
                    "chatGreeting",
                    "Cảm ơn bạn đã nhắn tin cho THORS! Cửa hàng đã nhận được tin nhắn và sẽ trả lời bạn sớm nhất có thể.",
                    "chatOpenTime", "08:00",
                    "chatCloseTime", "22:00",
                    "chatAwayMessage",
                    "Hiện cửa hàng đang ngoài giờ làm việc ({open} – {close}). Chúng tôi sẽ trả lời bạn ngay khi mở cửa nhé!",
                    "chatQuickReplies",
                    String.join("\n",
                            "Dạ cửa hàng chào bạn, bạn cần hỗ trợ gì ạ?",
                            "Dạ sản phẩm này hiện vẫn còn hàng ạ.",
                            "Dạ đơn hàng sẽ được giao trong 2–4 ngày làm việc ạ.",
                            "Dạ bạn được đổi trả trong 7 ngày kể từ khi nhận hàng ạ.",
                            "Cảm ơn bạn đã ủng hộ cửa hàng ạ!"),
                    "chatFaq",
                    String.join("\n",
                            "Phí giao hàng bao nhiêu? | Phí giao hàng được tính theo địa chỉ và hiện ngay ở bước đặt hàng trước khi bạn xác nhận.",
                            "Bao lâu thì nhận được hàng? | Thường từ 2–4 ngày làm việc tùy khu vực. Bạn theo dõi đơn trong mục Đơn hàng nhé.",
                            "Đổi trả thế nào? | Bạn được yêu cầu trả hàng trong 7 ngày kể từ khi nhận hàng: vào Đơn hàng > Trả hàng, chọn sản phẩm, lý do và gửi kèm ảnh/video."));

    /** Một câu hỏi thường gặp; answer = null với câu hỏi trạng thái đơn (trả lời theo dữ liệu thật). */
    public record Faq(String id, String question, String answer) {}

    private final WebsiteSettingRepository settings;

    public ChatAutoReply(WebsiteSettingRepository settings) {
        this.settings = settings;
    }

    /** Các khóa cài đặt và độ dài tối đa, theo thứ tự hiện trên trang cài đặt. */
    static final Map<String, Integer> LIMITS = new java.util.LinkedHashMap<>();

    static {
        LIMITS.put("chatGreeting", 500);
        LIMITS.put("chatOpenTime", 5);
        LIMITS.put("chatCloseTime", 5);
        LIMITS.put("chatAwayMessage", 500);
        LIMITS.put("chatQuickReplies", 2000);
        LIMITS.put("chatFaq", 3000);
    }

    /** Cài đặt hiện tại (đã gộp mặc định) cho trang cài đặt. */
    public Map<String, String> settings() {
        Map<String, String> saved = all();
        Map<String, String> out = new java.util.LinkedHashMap<>();
        LIMITS.keySet().forEach(key -> out.put(key, value(saved, key)));
        return out;
    }

    /** Lưu các khóa có trong values (khóa lạ bị bỏ qua); kiểm tra độ dài và định dạng giờ HH:mm. */
    public Map<String, String> save(Map<String, Object> values) {
        if (values == null) throw new com.thors.common.ApiException(400, "VALIDATION", "Thiếu dữ liệu.");
        Map<String, String> clean = new java.util.LinkedHashMap<>();
        for (var field : LIMITS.entrySet()) {
            if (!values.containsKey(field.getKey())) continue;
            Object raw = values.get(field.getKey());
            String value = raw == null ? "" : String.valueOf(raw).trim();
            if (value.length() > field.getValue())
                throw new com.thors.common.ApiException(400, "VALIDATION", "Nội dung quá dài (tối đa " + field.getValue() + " ký tự).");
            if (field.getKey().endsWith("Time") && !value.isEmpty() && !value.matches("([01]\\d|2[0-3]):[0-5]\\d"))
                throw new com.thors.common.ApiException(400, "VALIDATION", "Giờ làm việc phải có dạng HH:mm (ví dụ 08:00).");
            clean.put(field.getKey(), value);
        }
        if (!clean.isEmpty()) settings.saveAll(clean);
        return settings();
    }

    private Map<String, String> all() {
        try {
            return settings.findAll();
        } catch (RuntimeException e) {
            return Map.of();
        }
    }

    private static String value(Map<String, String> saved, String key) {
        String v = saved.containsKey(key) ? saved.get(key) : DEFAULTS.get(key);
        return v == null ? "" : v.trim();
    }

    /** Tin chào; rỗng = tắt. */
    public String greeting() {
        return value(all(), "chatGreeting");
    }

    /** Tin ngoài giờ nếu lúc now (giờ VN) nằm ngoài giờ làm việc; null nếu đang trong giờ hoặc đã tắt. */
    public String awayMessage(ZonedDateTime nowVn) {
        Map<String, String> s = all();
        String message = value(s, "chatAwayMessage");
        String open = value(s, "chatOpenTime");
        String close = value(s, "chatCloseTime");
        if (message.isEmpty() || open.isEmpty() || close.isEmpty()) return null;
        try {
            if (withinHours(nowVn.toLocalTime(), LocalTime.parse(open), LocalTime.parse(close))) return null;
        } catch (RuntimeException e) {
            return null; // giờ lưu sai định dạng: coi như không giới hạn giờ
        }
        return message.replace("{open}", open).replace("{close}", close);
    }

    /** Trong giờ làm việc; giờ đóng nhỏ hơn giờ mở nghĩa là làm qua đêm (vd 18:00 – 02:00). */
    static boolean withinHours(LocalTime now, LocalTime open, LocalTime close) {
        if (open.equals(close)) return true;
        return open.isBefore(close) ? !now.isBefore(open) && now.isBefore(close) : !now.isBefore(open) || now.isBefore(close);
    }

    /** Mẫu câu trả lời nhanh cho cửa hàng, mỗi dòng một câu. */
    public List<String> quickReplies() {
        return lines(value(all(), "chatQuickReplies"));
    }

    /** Câu hỏi thường gặp cho khách: câu hỏi trạng thái đơn có sẵn, rồi các câu chủ shop soạn ("Hỏi | Đáp"). */
    public List<Faq> faqs() {
        List<Faq> out = new ArrayList<>();
        out.add(new Faq(ORDER_STATUS_FAQ, "Đơn hàng của tôi tới đâu rồi?", null));
        int i = 0;
        for (String line : lines(value(all(), "chatFaq"))) {
            int bar = line.indexOf('|');
            if (bar <= 0 || bar == line.length() - 1) continue;
            String q = line.substring(0, bar).trim();
            String a = line.substring(bar + 1).trim();
            if (!q.isEmpty() && !a.isEmpty()) out.add(new Faq("faq-" + (i++), q, a));
        }
        return out;
    }

    private static List<String> lines(String text) {
        return Arrays.stream(text.split("\\r?\\n")).map(String::trim).filter(s -> !s.isEmpty()).toList();
    }
}

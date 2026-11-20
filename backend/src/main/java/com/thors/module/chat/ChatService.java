package com.thors.module.chat;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import com.thors.common.ApiException;
import com.thors.module.account.entity.Account;
import com.thors.module.chat.ChatRepository.Conversation;
import com.thors.module.chat.ChatViews.ConversationSummary;
import com.thors.module.chat.ChatViews.Message;
import com.thors.module.chat.ChatViews.SendRequest;
import com.thors.module.chat.ChatViews.Status;
import com.thors.module.chat.ChatViews.Thread;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Chat "Liên hệ người bán": mỗi khách hàng có một cuộc trò chuyện với cửa hàng; chủ shop và người nhà trả lời.
 * Tin nhắn có thể là chữ, ảnh, thẻ đơn hàng hoặc thẻ sản phẩm. Web tự hỏi tin mới vài giây một lần.
 */
@Service
public class ChatService {
    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    public static final String CUSTOMER = "CUSTOMER";
    public static final String STORE = "STORE";
    /** Tin cửa hàng gửi tự động (chào, ngoài giờ, trả lời câu hỏi thường gặp); khách thấy như tin cửa hàng. */
    public static final String AUTO = "AUTO";
    private static final Set<String> STORE_ROLES = Set.of("OWNER", "FAMILY_MEMBER");

    static final int MAX_BODY = 2000;
    static final int PAGE = 40;
    static final long MAX_IMAGE_BYTES = 5L * 1024 * 1024;
    /** Khách nhắn lại sau bấy nhiêu giờ im lặng thì được chào lại. */
    static final long GREET_AGAIN_HOURS = 12;
    /** Tin ngoài giờ gửi tối đa một lần trong bấy nhiêu giờ, để khách nhắn liên tục không bị trả lời lặp lại. */
    static final long AWAY_EVERY_HOURS = 3;

    private final ChatRepository chats;
    private final Cloudinary cloudinary;
    private final ChatAutoReply auto;

    public ChatService(ChatRepository chats, @Autowired(required = false) Cloudinary cloudinary, ChatAutoReply auto) {
        this.chats = chats;
        this.cloudinary = cloudinary;
        this.auto = auto;
    }

    private static boolean isCustomer(Account a) {
        return CUSTOMER.equals(a.role());
    }

    private static boolean isStore(Account a) {
        return STORE_ROLES.contains(a.role());
    }

    private void requireReady() {
        if (!chats.ready())
            throw new ApiException(503, "CHAT_NOT_READY",
                    "Chức năng chat chưa sẵn sàng (database chưa chạy migration 2026-11-20_chat.sql).");
    }

    private static void requireCustomer(Account a) {
        if (!isCustomer(a)) throw new ApiException(403, "ROLE", "Chỉ khách hàng dùng được khung chat này.");
    }

    private static void requireStore(Account a) {
        if (!isStore(a)) throw new ApiException(403, "ROLE", "Chỉ cửa hàng xem được tin nhắn của khách.");
    }

    /** Chat đã bật chưa và số tin chưa đọc (khách: tin cửa hàng gửi; cửa hàng: số cuộc trò chuyện có tin mới). */
    public Status status(Account actor) {
        if (!chats.ready()) return new Status(false, 0);
        if (isCustomer(actor)) return new Status(true, chats.unreadForCustomer(actor.id()));
        if (isStore(actor)) return new Status(true, chats.unreadConversationsForStore());
        return new Status(false, 0);
    }

    // ------------------------------------------------------------------ Phía khách hàng

    /** Khung chat của khách (chưa có cuộc trò chuyện thì trả danh sách rỗng, chưa tạo gì). */
    public Thread myThread(Account actor, long afterId, long beforeId) {
        requireReady();
        requireCustomer(actor);
        return chats.findByCustomer(actor.id())
                .map(c -> hideStaffNames(thread(c, afterId, beforeId, c.storeLastReadId())))
                .orElseGet(() -> new Thread(null, actor.fullName(), List.of(), 0, false));
    }

    /** Khách chỉ thấy "cửa hàng" trả lời, không cần (và không nên) biết tên nhân viên nào trả lời. */
    static Thread hideStaffNames(Thread t) {
        return new Thread(t.conversationId(), t.customerName(), t.messages().stream().map(ChatService::hideStaffName).toList(),
                t.otherLastReadId(), t.hasMore());
    }

    static Message hideStaffName(Message m) {
        if (CUSTOMER.equals(m.side())) return m;
        return new Message(m.id(), m.side(), 0, null, m.body(), m.imageUrl(), m.order(), m.product(), m.createdAt());
    }

    @Transactional
    public Message sendAsCustomer(Account actor, SendRequest req) {
        requireReady();
        requireCustomer(actor);
        Conversation c = chats.findOrCreate(actor.id());
        Message sent = send(c, actor, CUSTOMER, req);
        autoReply(c, sent.id(), ZonedDateTime.now(ChatAutoReply.VN));
        return hideStaffName(sent);
    }

    /**
     * Tự trả lời sau tin khách vừa gửi:
     * <ul>
     *   <li>Tin chào: tin đầu tiên của khách, hoặc khách nhắn lại sau {@link #GREET_AGAIN_HOURS} giờ im lặng.
     *   <li>Tin ngoài giờ: khách nhắn ngoài giờ làm việc, tối đa một lần mỗi {@link #AWAY_EVERY_HOURS} giờ.
     * </ul>
     * Tin tự động không đổi mốc "đã đọc" của cửa hàng, nên chủ shop vẫn thấy tin của khách là chưa đọc.
     */
    void autoReply(Conversation c, long customerMessageId, ZonedDateTime nowVn) {
        LocalDateTime nowUtc = nowVn.withZoneSameInstant(ZoneOffset.UTC).toLocalDateTime();
        LocalDateTime previous = chats.previousMessageAt(c.id(), customerMessageId);
        LocalDateTime lastAuto = chats.lastAutoAt(c.id());
        boolean greet = previous == null || previous.isBefore(nowUtc.minusHours(GREET_AGAIN_HOURS));
        boolean awayDue = lastAuto == null || lastAuto.isBefore(nowUtc.minusHours(AWAY_EVERY_HOURS)) || greet;

        String greeting = greet ? auto.greeting() : "";
        String away = awayDue ? auto.awayMessage(nowVn) : null;
        if (greeting.isEmpty() && (away == null || away.isEmpty())) return;
        Integer sender = chats.storeSenderId().orElse(null);
        if (sender == null) return; // chưa có tài khoản chủ cửa hàng nào để đứng tên tin tự động
        if (!greeting.isEmpty()) chats.insertMessage(c.id(), sender, AUTO, greeting, null, null, null);
        if (away != null && !away.isEmpty()) chats.insertMessage(c.id(), sender, AUTO, away, null, null, null);
    }

    /** Câu hỏi thường gặp cho khách: [{id, question}] (câu trả lời chỉ gửi khi khách bấm). */
    public List<Map<String, String>> faqs(Account actor) {
        requireReady();
        requireCustomer(actor);
        return auto.faqs().stream().map(f -> Map.of("id", f.id(), "question", f.question())).toList();
    }

    /**
     * Khách bấm một câu hỏi thường gặp: gửi câu hỏi như tin của khách và trả lời tự động ngay. Câu "Đơn của tôi
     * tới đâu rồi?" trả lời bằng trạng thái các đơn đang xử lý của chính khách. Trả về [tin hỏi, tin trả lời].
     */
    @Transactional
    public List<Message> askFaq(Account actor, String faqId) {
        requireReady();
        requireCustomer(actor);
        ChatAutoReply.Faq faq =
                auto.faqs().stream()
                        .filter(f -> f.id().equals(faqId))
                        .findFirst()
                        .orElseThrow(() -> new ApiException(404, "FAQ_NOT_FOUND", "Câu hỏi này không còn, vui lòng tải lại khung chat."));
        Integer sender = chats.storeSenderId().orElseThrow(() -> new ApiException(503, "NO_OWNER", "Cửa hàng chưa sẵn sàng trả lời."));
        Conversation c = chats.findOrCreate(actor.id());
        long q = chats.insertMessage(c.id(), actor.id(), CUSTOMER, faq.question(), null, null, null);
        String answer = ChatAutoReply.ORDER_STATUS_FAQ.equals(faq.id()) ? orderStatusAnswer(actor.id()) : faq.answer();
        long a = chats.insertMessage(c.id(), sender, AUTO, answer, null, null, null);
        return chats.messages(c.id(), q - 1, 0, PAGE).stream()
                .filter(m -> m.id() == q || m.id() == a)
                .map(ChatService::hideStaffName)
                .toList();
    }

    private static final Map<String, String> STATUS_TEXT =
            Map.of(
                    "AWAITING_PAYMENT", "đang chờ bạn thanh toán",
                    "PENDING_CONFIRMATION", "đang chờ cửa hàng xác nhận",
                    "AWAITING_PICKUP", "đã được xác nhận, đang chuẩn bị giao",
                    "SHIPPING", "đang được giao đến bạn",
                    "DELIVERED", "đã giao thành công");

    /** Trả lời "Đơn của tôi tới đâu rồi?" theo các đơn đang xử lý của khách. */
    String orderStatusAnswer(int customerId) {
        var orders = chats.activeOrders(customerId, 5);
        if (orders.isEmpty())
            return "Hiện bạn không có đơn hàng nào đang xử lý. Bạn có thể xem lại các đơn đã đặt trong mục Đơn hàng.";
        StringBuilder sb = new StringBuilder("Tình trạng đơn hàng của bạn:");
        for (var o : orders) {
            sb.append("\n• Đơn ").append(o.orderNumber()).append(": ").append(STATUS_TEXT.getOrDefault(o.status(), o.status()));
            if ("SHIPPING".equals(o.status()) && "GHN".equals(o.carrier()) && o.trackingNumber() != null)
                sb.append(" (Giao Hàng Nhanh, mã vận đơn ").append(o.trackingNumber()).append(")");
        }
        sb.append("\nBạn xem chi tiết từng đơn trong mục Đơn hàng nhé.");
        return sb.toString();
    }

    /** Mẫu câu trả lời nhanh cho cửa hàng. */
    public List<String> quickReplies(Account actor) {
        requireStore(actor);
        return auto.quickReplies();
    }

    /** Cài đặt tin nhắn tự động: chỉ chủ cửa hàng xem và sửa. */
    public Map<String, String> autoSettings(Account actor) {
        requireOwner(actor);
        return auto.settings();
    }

    public Map<String, String> saveAutoSettings(Account actor, Map<String, Object> values) {
        requireOwner(actor);
        return auto.save(values);
    }

    private static void requireOwner(Account a) {
        if (!"OWNER".equals(a.role())) throw new ApiException(403, "ROLE", "Chỉ chủ cửa hàng được sửa tin nhắn tự động.");
    }

    public void readAsCustomer(Account actor, long upTo) {
        requireReady();
        requireCustomer(actor);
        chats.findByCustomer(actor.id()).ifPresent(c -> chats.markRead(c.id(), CUSTOMER, upTo));
    }

    // ------------------------------------------------------------------ Phía cửa hàng

    public List<ConversationSummary> conversations(Account actor, String q) {
        requireReady();
        requireStore(actor);
        if (q != null && q.length() > 100) throw new ApiException(400, "QUERY", "Từ khóa tìm kiếm quá dài.");
        return chats.conversations(q, 200);
    }

    public Thread storeThread(Account actor, int conversationId, long afterId, long beforeId) {
        requireReady();
        requireStore(actor);
        Conversation c = conversation(conversationId);
        return thread(c, afterId, beforeId, c.customerLastReadId());
    }

    @Transactional
    public Message sendAsStore(Account actor, int conversationId, SendRequest req) {
        requireReady();
        requireStore(actor);
        return send(conversation(conversationId), actor, STORE, req);
    }

    public void readAsStore(Account actor, int conversationId, long upTo) {
        requireReady();
        requireStore(actor);
        chats.markRead(conversation(conversationId).id(), STORE, upTo);
    }

    private Conversation conversation(int id) {
        return chats.find(id).orElseThrow(() -> new ApiException(404, "CHAT_NOT_FOUND", "Không tìm thấy cuộc trò chuyện."));
    }

    // ------------------------------------------------------------------ Dùng chung

    private Thread thread(Conversation c, long afterId, long beforeId, long otherLastReadId) {
        List<Message> messages = chats.messages(c.id(), Math.max(afterId, 0), Math.max(beforeId, 0), PAGE);
        // Tải lần đầu hoặc xem tin cũ: báo còn tin cũ hơn không; tự cập nhật (afterId) thì không cần
        boolean hasMore = afterId <= 0 && !messages.isEmpty() && chats.hasOlder(c.id(), messages.get(0).id());
        return new Thread(c.id(), chats.customerName(c.customerId()), messages, otherLastReadId, hasMore);
    }

    private Message send(Conversation c, Account actor, String side, SendRequest req) {
        String body = req == null || req.body() == null ? null : req.body().strip();
        if (body != null && body.isEmpty()) body = null;
        String image = req == null || req.imageUrl() == null || req.imageUrl().isBlank() ? null : req.imageUrl().trim();
        Integer orderId = req == null ? null : req.orderId();
        Integer productId = req == null ? null : req.productId();

        if (body == null && image == null && orderId == null && productId == null)
            throw new ApiException(400, "EMPTY_MESSAGE", "Tin nhắn trống.");
        if (body != null && body.length() > MAX_BODY)
            throw new ApiException(400, "MESSAGE_TOO_LONG", "Tin nhắn tối đa " + MAX_BODY + " ký tự.");
        // Chỉ nhận ảnh đã tải lên qua /api/chat/upload (Cloudinary), không nhận link ảnh bất kỳ
        if (image != null && (!image.startsWith("https://res.cloudinary.com/") || image.length() > 500))
            throw new ApiException(400, "IMAGE_URL", "Ảnh không hợp lệ, vui lòng tải ảnh lên lại.");
        if (orderId != null) {
            // Đơn đính kèm phải là đơn online của chính khách trong cuộc trò chuyện
            Integer owner = chats.orderOwner(orderId).orElse(null);
            if (owner == null || owner != c.customerId())
                throw new ApiException(400, "ORDER_NOT_FOUND", "Không tìm thấy đơn hàng này của khách.");
        }
        if (productId != null && !chats.productExists(productId))
            throw new ApiException(400, "PRODUCT_NOT_FOUND", "Không tìm thấy sản phẩm.");

        long id = chats.insertMessage(c.id(), actor.id(), side, body, image, orderId, productId);
        return chats.messages(c.id(), id - 1, 0, 1).stream().filter(m -> m.id() == id).findFirst().orElseThrow();
    }

    /** Tải ảnh gửi trong chat lên Cloudinary; chỉ nhận ảnh, tối đa 5MB. Trả về { url }. */
    public Map<String, Object> upload(Account actor, MultipartFile file) {
        requireReady();
        if (!isCustomer(actor) && !isStore(actor)) throw new ApiException(403, "ROLE", "Không có quyền gửi ảnh.");
        if (file == null || file.isEmpty()) throw new ApiException(400, "FILE_EMPTY", "Vui lòng chọn ảnh.");
        if (file.getSize() > MAX_IMAGE_BYTES) throw new ApiException(400, "FILE_TOO_LARGE", "Ảnh tối đa 5MB.");
        String type = file.getContentType();
        if (type == null || !type.startsWith("image/"))
            throw new ApiException(400, "FILE_TYPE", "Chỉ gửi được tệp ảnh (JPG, PNG, WEBP...).");
        if (cloudinary == null)
            throw new ApiException(503, "CLOUDINARY_NOT_CONFIGURED", "Dịch vụ tải ảnh chưa được cấu hình.");
        try {
            Map<?, ?> result =
                    cloudinary.uploader().upload(file.getBytes(), ObjectUtils.asMap("folder", "thors/chat", "resource_type", "image"));
            return Map.of("url", result.get("secure_url"));
        } catch (IOException | RuntimeException e) {
            log.warn("Tải ảnh chat lên Cloudinary lỗi: {}", e.getMessage());
            throw new ApiException(502, "UPLOAD_FAILED", "Không tải được ảnh lên, vui lòng thử lại.");
        }
    }
}

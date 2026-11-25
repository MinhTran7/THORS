package com.thors.module.chat;

import com.thors.module.chat.ChatViews.ReadRequest;
import com.thors.module.chat.ChatViews.SendRequest;
import com.thors.security.SessionAccess;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Chat giữa khách hàng và cửa hàng. Cần đăng nhập.
 *
 * <ul>
 *   <li>GET /api/chat/status → {available, unread}
 *   <li>Khách: GET /api/chat/me?after=&before=, POST /api/chat/me/messages, POST /api/chat/me/read
 *   <li>Cửa hàng: GET /api/chat/conversations?q=, GET /api/chat/conversations/{id}?after=&before=,
 *       POST /api/chat/conversations/{id}/messages, POST /api/chat/conversations/{id}/read
 *   <li>POST /api/chat/upload (multipart file) → {url}
 * </ul>
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {
    private final ChatService service;
    private final SessionAccess sessions;

    public ChatController(ChatService service, SessionAccess sessions) {
        this.service = service;
        this.sessions = sessions;
    }

    @GetMapping("/status")
    Object status() {
        return service.status(sessions.current());
    }

    @GetMapping("/me")
    Object myThread(@RequestParam(defaultValue = "0") long after, @RequestParam(defaultValue = "0") long before) {
        return service.myThread(sessions.current(), after, before);
    }

    @PostMapping("/me/messages")
    Object sendAsCustomer(@RequestBody SendRequest req) {
        return service.sendAsCustomer(sessions.current(), req);
    }

    /** GET /api/chat/me/faq → [{id, question}]: câu hỏi thường gặp hiện thành nút trong khung chat của khách */
    @GetMapping("/me/faq")
    Object faqs() {
        return service.faqs(sessions.current());
    }

    /** POST /api/chat/me/faq {id} → [tin hỏi, tin trả lời tự động] */
    @PostMapping("/me/faq")
    Object askFaq(@RequestBody Map<String, String> body) {
        return service.askFaq(sessions.current(), body == null ? null : body.get("id"));
    }

    /** GET /api/chat/quick-replies → ["..."]: mẫu câu trả lời nhanh của cửa hàng */
    @GetMapping("/quick-replies")
    Object quickReplies() {
        return service.quickReplies(sessions.current());
    }

    /** GET /api/chat/settings: cài đặt tin nhắn tự động (chủ cửa hàng) */
    @GetMapping("/settings")
    Object autoSettings() {
        return service.autoSettings(sessions.current());
    }

    /** PUT /api/chat/settings {chatGreeting, chatOpenTime, ...}: lưu các khóa gửi lên (chủ cửa hàng) */
    @PutMapping("/settings")
    Object saveAutoSettings(@RequestBody Map<String, Object> body) {
        return service.saveAutoSettings(sessions.current(), body);
    }

    @PostMapping("/me/read")
    Object readAsCustomer(@RequestBody ReadRequest req) {
        service.readAsCustomer(sessions.current(), req == null || req.upTo() == null ? 0 : req.upTo());
        return Map.of("ok", true);
    }

    @GetMapping("/conversations")
    Object conversations(@RequestParam(required = false) String q) {
        return service.conversations(sessions.current(), q);
    }

    @GetMapping("/conversations/{id}")
    Object storeThread(
            @PathVariable int id, @RequestParam(defaultValue = "0") long after, @RequestParam(defaultValue = "0") long before) {
        return service.storeThread(sessions.current(), id, after, before);
    }

    @PostMapping("/conversations/{id}/messages")
    Object sendAsStore(@PathVariable int id, @RequestBody SendRequest req) {
        return service.sendAsStore(sessions.current(), id, req);
    }

    @PostMapping("/conversations/{id}/read")
    Object readAsStore(@PathVariable int id, @RequestBody ReadRequest req) {
        service.readAsStore(sessions.current(), id, req == null || req.upTo() == null ? 0 : req.upTo());
        return Map.of("ok", true);
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    Object upload(@RequestPart("file") MultipartFile file) {
        return service.upload(sessions.current(), file);
    }
}

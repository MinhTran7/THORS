import { useEffect } from 'react';
import useSWR from 'swr';
import { api, post } from 'services/http';

const query = (params) => {
  const s = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && s.set(k, v));
  const text = s.toString();
  return text ? `?${text}` : '';
};

// Chat "Liên hệ người bán" (backend ChatController). Thời gian trong dữ liệu là giờ UTC.
export const chatApi = {
  status: () => api('/chat/status'),
  // Khách hàng
  myThread: (after, before) => api(`/chat/me${query({ after, before })}`),
  sendMine: (message) => post('/chat/me/messages', message),
  readMine: (upTo) => post('/chat/me/read', { upTo }),
  // Câu hỏi thường gặp: [{id, question}]; bấm một câu → [tin hỏi, tin trả lời tự động]
  faqs: () => api('/chat/me/faq'),
  askFaq: (id) => post('/chat/me/faq', { id }),
  // Mẫu câu trả lời nhanh của cửa hàng: ["..."]
  quickReplies: () => api('/chat/quick-replies'),
  // Cài đặt tin nhắn tự động (chủ cửa hàng): { chatGreeting, chatOpenTime, chatCloseTime, chatAwayMessage, chatQuickReplies, chatFaq }
  settings: () => api('/chat/settings'),
  saveSettings: (values) => api('/chat/settings', { method: 'PUT', body: values }),
  // Cửa hàng
  conversations: (q) => api(`/chat/conversations${query({ q })}`),
  thread: (id, after, before) => api(`/chat/conversations/${id}${query({ after, before })}`),
  send: (id, message) => post(`/chat/conversations/${id}/messages`, message),
  read: (id, upTo) => post(`/chat/conversations/${id}/read`, { upTo }),
  // Ảnh: tải lên trước, rồi gửi URL trong tin nhắn
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return api('/chat/upload', { method: 'POST', form });
  }
};

// Khoá SWR của trạng thái chat (đã bật chưa, số tin chưa đọc), dùng chung để cập nhật ở nhiều nơi
export const CHAT_STATUS_KEY = ['chat-status'];

/** Trạng thái chat, tự hỏi lại 15 giây một lần (chỉ khi tab đang mở). enabled = false thì không gọi. */
export function useChatStatus(enabled = true) {
  const { data, mutate } = useSWR(enabled ? CHAT_STATUS_KEY : null, () => chatApi.status(), {
    refreshInterval: 15000,
    revalidateOnFocus: true,
    refreshWhenHidden: false,
    shouldRetryOnError: false
  });
  return { available: Boolean(data?.available), unread: data?.unread ?? 0, refresh: mutate };
}

/**
 * Mở khung chat của khách từ bất kỳ đâu (nút "Liên hệ người bán", "Chat với cửa hàng").
 * context: { orderId, orderNumber } hoặc { productId, productName } để đính kèm vào tin nhắn đầu tiên.
 */
export const openCustomerChat = (context = {}) => window.dispatchEvent(new CustomEvent('thors:open-chat', { detail: context }));

/** Lắng nghe yêu cầu mở khung chat. */
export function useOpenChatListener(handler) {
  useEffect(() => {
    const listener = (event) => handler(event.detail || {});
    window.addEventListener('thors:open-chat', listener);
    return () => window.removeEventListener('thors:open-chat', listener);
  }, [handler]);
}

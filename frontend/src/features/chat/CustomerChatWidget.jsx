import { useCallback, useState } from 'react';
import { Badge, Box, IconButton, Paper } from '@mui/material';
import { CloseOutlined, MessageOutlined } from '@ant-design/icons';
import useSWR, { useSWRConfig } from 'swr';
import { C, SANS } from 'features/shop/storeTheme';
import ChatThread from './ChatThread';
import { CHAT_STATUS_KEY, chatApi, useChatStatus, useOpenChatListener } from './api';

// Bảng màu cửa hàng cho khung chat của khách
const STORE_PALETTE = {
  bg: C.cream,
  ink: C.ink,
  muted: C.muted,
  line: C.line,
  mine: C.primary,
  mineInk: '#FFFFFF',
  theirs: '#FFFFFF',
  accent: C.primary
};

/**
 * Khung chat "Liên hệ người bán" của khách: nút tròn ở góc phải dưới (kèm số tin cửa hàng gửi chưa đọc),
 * bấm vào mở khung chat. Nơi khác mở bằng openCustomerChat({ orderId, orderNumber } | { productId, productName })
 * để đính kèm thẻ đơn / sản phẩm vào tin nhắn tiếp theo. Ẩn khi database chưa chạy migration chat.
 */
export default function CustomerChatWidget() {
  const { available, unread } = useChatStatus(true);
  const { mutate } = useSWRConfig();
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState(null);

  useOpenChatListener(
    useCallback((detail) => {
      setContext(detail?.orderId || detail?.productId ? detail : null);
      setOpen(true);
    }, [])
  );

  const refreshStatus = useCallback(() => mutate(CHAT_STATUS_KEY), [mutate]);
  const load = useCallback((after, before) => chatApi.myThread(after || undefined, before || undefined), []);
  const send = useCallback((message) => chatApi.sendMine(message), []);
  const markRead = useCallback((upTo) => chatApi.readMine(upTo), []);
  const askFaq = useCallback((id) => chatApi.askFaq(id), []);
  // Câu hỏi thường gặp: chỉ tải khi đã mở khung chat
  const faqs = useSWR(available && open ? ['chat-faqs'] : null, () => chatApi.faqs(), { revalidateOnFocus: false });

  if (!available) return null;

  return (
    <Box sx={{ position: 'fixed', right: { xs: 12, sm: 24 }, bottom: { xs: 12, sm: 24 }, zIndex: 1300, fontFamily: SANS }}>
      {open ? (
        <Paper
          elevation={8}
          role="dialog"
          aria-label="Chat với cửa hàng"
          sx={{
            width: { xs: 'calc(100vw - 24px)', sm: 360 },
            height: { xs: 'min(560px, calc(100vh - 24px))', sm: 520 },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            borderRadius: '16px',
            border: `1px solid ${C.line}`
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, py: 1.25, bgcolor: C.primary, color: '#FFFFFF' }}>
            <MessageOutlined />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box sx={{ fontSize: 15, fontWeight: 600 }}>Chat với cửa hàng</Box>
              <Box sx={{ fontSize: 11.5, opacity: 0.85 }}>Cửa hàng sẽ trả lời sớm nhất có thể</Box>
            </Box>
            <IconButton size="small" aria-label="Đóng khung chat" onClick={() => setOpen(false)} sx={{ color: '#FFFFFF' }}>
              <CloseOutlined />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0 }}>
            <ChatThread
              threadKey="me"
              load={load}
              send={send}
              markRead={markRead}
              mySide="CUSTOMER"
              context={context}
              onClearContext={() => setContext(null)}
              onActivity={refreshStatus}
              palette={STORE_PALETTE}
              emptyText="Bạn cần hỗ trợ gì? Chọn một câu hỏi bên dưới hoặc nhắn cho cửa hàng, chúng tôi sẽ trả lời sớm nhất."
              faqs={faqs.data ?? []}
              askFaq={askFaq}
            />
          </Box>
        </Paper>
      ) : (
        <Badge badgeContent={unread} color="error" max={99} overlap="circular">
          <IconButton
            aria-label={unread ? `Chat với cửa hàng, ${unread} tin chưa đọc` : 'Chat với cửa hàng'}
            onClick={() => setOpen(true)}
            sx={{
              width: 56,
              height: 56,
              bgcolor: C.primary,
              color: '#FFFFFF',
              boxShadow: '0 8px 24px rgba(0,0,0,.18)',
              '&:hover': { bgcolor: C.primaryDark }
            }}
          >
            <MessageOutlined style={{ fontSize: 24 }} />
          </IconButton>
        </Badge>
      )}
    </Box>
  );
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, CircularProgress, Dialog, IconButton, InputBase, Menu, MenuItem, Tooltip } from '@mui/material';
import { CloseOutlined, PictureOutlined, RobotOutlined, SendOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { parseUtc } from 'features/account/format';
import { formatVnd, orderStatusMeta } from 'features/order/constants';
import { chatApi } from './api';

const POLL_MS = 3000;

const pad = (n) => String(n).padStart(2, '0');
const timeOf = (value) => {
  const d = parseUtc(value);
  return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
};
const dayOf = (value) => {
  const d = parseUtc(value);
  if (!d) return '';
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hôm nay';
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Màu mặc định (giao diện quản trị); khung chat của khách truyền bảng màu cửa hàng vào
export const ADMIN_PALETTE = {
  bg: '#F8FAFC',
  ink: '#1E293B',
  muted: '#64748B',
  line: '#E2E8F0',
  mine: '#8EECF5',
  mineInk: '#0F172A',
  theirs: '#FFFFFF',
  accent: '#0E7490'
};

/** Thẻ đơn hàng / sản phẩm đính kèm trong tin nhắn. */
function AttachmentCard({ to, image, title, lines, palette }) {
  return (
    <Box
      component={RouterLink}
      to={to}
      sx={{
        display: 'flex',
        gap: 1.25,
        p: 1,
        mt: 0.5,
        bgcolor: '#FFFFFF',
        border: `1px solid ${palette.line}`,
        borderRadius: '10px',
        color: palette.ink,
        textDecoration: 'none',
        maxWidth: 280,
        '&:hover': { borderColor: palette.accent }
      }}
    >
      <Box
        sx={{
          width: 52,
          height: 52,
          flexShrink: 0,
          borderRadius: '8px',
          bgcolor: palette.bg,
          backgroundImage: image ? `url(${image})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      />
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</Box>
        {lines.filter(Boolean).map((line) => (
          <Box key={line} sx={{ fontSize: 12, color: palette.muted }}>
            {line}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// Tin do trợ lý AI gửi: cả hai phía đều được ghi rõ là AI trả lời
const AI_SIDES = new Set(['BOT', 'HANDOFF']);

// Ai đã gửi tin của cửa hàng. Phía cửa hàng (mine): người, tin tự động hay trợ lý AI; phía khách: chỉ ghi khi là AI
const senderLabel = (message, mine) => {
  if (!mine) return AI_SIDES.has(message.side) ? 'Trợ lý AI của cửa hàng · ' : '';
  if (message.side === 'AUTO') return 'Trả lời tự động · ';
  if (message.side === 'BOT') return 'Trợ lý AI · ';
  if (message.side === 'HANDOFF') return 'Trợ lý AI đã chuyển cho nhân viên · ';
  return message.senderName ? `${message.senderName} · ` : '';
};

function MessageBubble({ message, mine, seen, showName, palette, onPreview, storeView = false }) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: mine ? 'flex-end' : 'flex-start', mb: 1 }}>
      {message.body && (
        <Box
          sx={{
            maxWidth: '78%',
            px: 1.5,
            py: 1,
            borderRadius: mine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
            bgcolor: mine ? palette.mine : palette.theirs,
            color: mine ? palette.mineInk : palette.ink,
            border: mine ? 'none' : `1px solid ${palette.line}`,
            fontSize: 14,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {message.body}
        </Box>
      )}
      {message.imageUrl && (
        // Bấm ảnh: xem phóng to ngay trên trang (không mở tab mới)
        <Box
          component="button"
          type="button"
          onClick={() => onPreview(message.imageUrl)}
          aria-label="Xem ảnh lớn"
          sx={{ mt: message.body ? 0.5 : 0, p: 0, border: 0, bgcolor: 'transparent', cursor: 'zoom-in', borderRadius: '10px' }}
        >
          <Box
            component="img"
            src={message.imageUrl}
            alt="Ảnh gửi trong tin nhắn"
            sx={{ display: 'block', maxWidth: 220, maxHeight: 240, borderRadius: '10px', border: `1px solid ${palette.line}` }}
          />
        </Box>
      )}
      {message.order && (
        <AttachmentCard
          palette={palette}
          to={`/orders/${message.order.id}`}
          image={message.order.imageUrl}
          title={`Đơn ${message.order.orderNumber}`}
          lines={[`${message.order.itemCount} sản phẩm · ${formatVnd(message.order.totalAmount)}`, orderStatusMeta(message.order.status).label]}
        />
      )}
      {message.product && (
        <AttachmentCard
          palette={palette}
          // Cửa hàng không vào trang của khách: mở trang chi tiết sản phẩm quản trị
          to={storeView ? `/products/${message.product.id}` : `/shop/products/${message.product.id}`}
          image={message.product.imageUrl}
          title={message.product.name}
          lines={[message.product.minPrice != null ? `Từ ${formatVnd(message.product.minPrice)}` : null]}
        />
      )}
      <Box sx={{ fontSize: 11, color: palette.muted, mt: 0.25, px: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
        {showName && AI_SIDES.has(message.side) && <RobotOutlined style={{ fontSize: 12 }} />}
        {showName ? senderLabel(message, mine) : ''}
        {timeOf(message.createdAt)}
        {mine && seen ? ' · Đã xem' : ''}
      </Box>
    </Box>
  );
}

/**
 * Khung hội thoại dùng chung cho khách và cửa hàng: danh sách tin (tự hỏi tin mới 3 giây/lần khi đang mở),
 * xem tin cũ, gửi chữ / ảnh, và thẻ đính kèm đang chờ gửi (đơn hàng / sản phẩm khách đang hỏi).
 *
 * load(after, before) → Thread; send(message) → Message; markRead(upTo).
 * mySide: 'CUSTOMER' | 'STORE'. context: { orderId, orderNumber } | { productId, productName } | null.
 */
export default function ChatThread({
  threadKey,
  load,
  send,
  markRead,
  mySide,
  context,
  onClearContext,
  onActivity,
  palette = ADMIN_PALETTE,
  emptyText = 'Chưa có tin nhắn nào. Hãy gửi lời chào!',
  // Khách: các câu hỏi thường gặp [{id, question}] hiện thành nút; bấm → askFaq(id) trả về [tin hỏi, tin đáp]
  faqs = [],
  askFaq,
  // Cửa hàng: mẫu câu trả lời nhanh ["..."], chọn là điền vào ô nhập
  quickReplies = []
}) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [otherRead, setOtherRead] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(null); // ảnh đang xem phóng to
  const [quickAnchor, setQuickAnchor] = useState(null); // menu mẫu câu trả lời nhanh
  const listRef = useRef(null);
  const lastIdRef = useRef(0);
  const readRef = useRef(0);
  const stickRef = useRef(true); // đang ở cuối danh sách thì tin mới tự cuộn xuống
  const fileRef = useRef(null);

  const merge = useCallback((incoming) => {
    if (!incoming?.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))].sort((a, b) => a.id - b.id);
      lastIdRef.current = next.length ? next[next.length - 1].id : 0;
      return next;
    });
  }, []);

  // Báo đã đọc tới tin mới nhất của phía bên kia
  const reportRead = useCallback(
    (list) => {
      const latest = list.length ? list[list.length - 1].id : 0;
      if (latest > readRef.current && markRead) {
        readRef.current = latest;
        markRead(latest)
          .then(() => onActivity?.())
          .catch(() => {});
      }
    },
    [markRead, onActivity]
  );

  // Tải lần đầu (và khi đổi cuộc trò chuyện)
  useEffect(() => {
    let alive = true;
    setMessages([]);
    setLoading(true);
    setError('');
    lastIdRef.current = 0;
    readRef.current = 0;
    stickRef.current = true;
    load(0, 0)
      .then((data) => {
        if (!alive) return;
        const list = data?.messages ?? [];
        setMessages(list);
        lastIdRef.current = list.length ? list[list.length - 1].id : 0;
        setHasMore(Boolean(data?.hasMore));
        setOtherRead(data?.otherLastReadId ?? 0);
        reportRead(list);
      })
      .catch((e) => alive && setError(e.message || 'Không tải được tin nhắn.'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadKey]);

  // Tự hỏi tin mới mỗi 3 giây khi tab đang mở
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.hidden) return;
      load(lastIdRef.current, 0)
        .then((data) => {
          const incoming = data?.messages ?? [];
          setOtherRead(data?.otherLastReadId ?? 0);
          if (incoming.length) {
            merge(incoming);
            reportRead(incoming);
          }
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [threadKey, load, merge, reportRead]);

  // Cuộn xuống cuối khi có tin mới (nếu người dùng đang ở cuối)
  useEffect(() => {
    const el = listRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onScroll = () => {
    const el = listRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
  };

  const loadOlder = async () => {
    if (!messages.length) return;
    const el = listRef.current;
    const before = el ? el.scrollHeight : 0;
    setLoadingOlder(true);
    try {
      const data = await load(0, messages[0].id);
      const older = data?.messages ?? [];
      stickRef.current = false;
      setMessages((prev) => [...older.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setHasMore(Boolean(data?.hasMore));
      // Giữ nguyên vị trí đang đọc sau khi chèn tin cũ lên trên
      requestAnimationFrame(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch (e) {
      setError(e.message || 'Không tải được tin cũ.');
    } finally {
      setLoadingOlder(false);
    }
  };

  // Sau khi gửi: hỏi tin mới ngay (tin tự động của cửa hàng hiện liền, không phải chờ 3 giây)
  const fetchNewSoon = () => {
    setTimeout(() => {
      load(lastIdRef.current, 0)
        .then((data) => merge(data?.messages ?? []))
        .catch(() => {});
    }, 400);
  };

  // Khách bấm một câu hỏi thường gặp: hiện ngay câu hỏi và câu trả lời tự động
  const pickFaq = async (id) => {
    if (!askFaq || sending) return;
    setSending(true);
    setError('');
    try {
      const pair = await askFaq(id);
      stickRef.current = true;
      merge(pair);
      onActivity?.();
    } catch (e) {
      setError(e.message || 'Không gửi được câu hỏi.');
    } finally {
      setSending(false);
    }
  };

  const doSend = async () => {
    if (pendingImage?.uploading) return; // chờ ảnh tải lên xong
    const body = text.trim();
    const payload = {
      body: body || null,
      imageUrl: pendingImage?.url ?? null,
      orderId: context?.orderId ?? null,
      productId: context?.productId ?? null
    };
    if (!payload.body && !payload.imageUrl && !payload.orderId && !payload.productId) return;
    setSending(true);
    setError('');
    try {
      const message = await send(payload);
      stickRef.current = true;
      merge([message]);
      setText('');
      clearPendingImage();
      onClearContext?.();
      fetchNewSoon();
      onActivity?.();
    } catch (e) {
      setError(e.message || 'Không gửi được tin nhắn.');
    } finally {
      setSending(false);
    }
  };

  // Ảnh đang chờ gửi: { preview (ảnh trên máy để xem trước), url (sau khi tải lên), uploading }
  const [pendingImage, setPendingImage] = useState(null);
  const clearPendingImage = () =>
    setPendingImage((prev) => {
      if (prev?.preview) URL.revokeObjectURL(prev.preview);
      return null;
    });

  // Chọn ảnh: tải lên ngay để gửi nhanh, nhưng chỉ GỬI khi bấm nút gửi (viết thêm chữ kèm được)
  const onPickImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Chỉ gửi được tệp ảnh.');
    if (file.size > 5 * 1024 * 1024) return setError('Ảnh tối đa 5MB.');
    setError('');
    clearPendingImage();
    const preview = URL.createObjectURL(file);
    setPendingImage({ preview, url: null, uploading: true });
    try {
      const { url } = await chatApi.upload(file);
      setPendingImage((prev) => (prev?.preview === preview ? { ...prev, url, uploading: false } : prev));
    } catch (e) {
      setError(e.message || 'Không tải được ảnh lên.');
      setPendingImage((prev) => (prev?.preview === preview ? null : prev));
      URL.revokeObjectURL(preview);
    }
  };

  // Tin tự động (AUTO) là tin của cửa hàng: phía cửa hàng coi là của mình, phía khách coi là của cửa hàng
  const isMine = (m) => m.side === mySide || (mySide === 'STORE' && m.side !== 'CUSTOMER');
  const lastMine = [...messages].reverse().find(isMine);
  let lastDay = '';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, bgcolor: palette.bg }}>
      {/* Xem ảnh phóng to: bấm ra ngoài, nút X hoặc Esc để đóng */}
      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        maxWidth={false}
        slotProps={{
          paper: { sx: { bgcolor: 'transparent', boxShadow: 'none', m: 1, overflow: 'visible' } },
          backdrop: { sx: { bgcolor: 'rgba(0,0,0,.82)' } }
        }}
        sx={{ zIndex: 1500 }}
      >
        <IconButton
          aria-label="Đóng ảnh"
          onClick={() => setPreview(null)}
          sx={{ position: 'fixed', top: 12, right: 12, color: '#FFFFFF', bgcolor: 'rgba(0,0,0,.4)', '&:hover': { bgcolor: 'rgba(0,0,0,.6)' } }}
        >
          <CloseOutlined />
        </IconButton>
        {preview && (
          <Box
            component="img"
            src={preview}
            alt="Ảnh trong tin nhắn"
            onClick={() => setPreview(null)}
            sx={{ display: 'block', maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: '8px', cursor: 'zoom-out' }}
          />
        )}
      </Dialog>
      <Box ref={listRef} onScroll={onScroll} sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 2, py: 1.5 }}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        )}
        {!loading && hasMore && (
          <Box sx={{ textAlign: 'center', mb: 1 }}>
            <Box
              component="button"
              type="button"
              disabled={loadingOlder}
              onClick={loadOlder}
              sx={{ border: 0, bgcolor: 'transparent', color: palette.accent, fontSize: 12.5, cursor: 'pointer', font: 'inherit' }}
            >
              {loadingOlder ? 'Đang tải…' : 'Xem tin nhắn cũ hơn'}
            </Box>
          </Box>
        )}
        {!loading && messages.length === 0 && !error && (
          <Box sx={{ textAlign: 'center', color: palette.muted, fontSize: 13, py: 4, px: 2 }}>{emptyText}</Box>
        )}
        {messages.map((m) => {
          const day = dayOf(m.createdAt);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <Box key={m.id}>
              {showDay && (
                <Box sx={{ textAlign: 'center', fontSize: 11.5, color: palette.muted, my: 1.25 }}>
                  <Box component="span" sx={{ px: 1.25, py: 0.25, bgcolor: '#FFFFFF', borderRadius: 10, border: `1px solid ${palette.line}` }}>
                    {day}
                  </Box>
                </Box>
              )}
              <MessageBubble
                message={m}
                mine={isMine(m)}
                seen={lastMine?.id === m.id && otherRead >= m.id}
                // Phía cửa hàng: ghi ai đã trả lời. Phía khách: không lộ tên nhân viên, nhưng ghi rõ tin do trợ lý AI trả lời
                showName={mySide === 'STORE' ? m.side !== 'CUSTOMER' : AI_SIDES.has(m.side)}
                onPreview={setPreview}
                palette={palette}
                storeView={mySide === 'STORE'}
              />
            </Box>
          );
        })}
      </Box>

      {error && <Box sx={{ px: 2, py: 0.75, fontSize: 12.5, color: '#B91C1C', bgcolor: '#FEF2F2' }}>{error}</Box>}

      {/* Thẻ đang hỏi: gửi kèm tin nhắn tiếp theo */}
      {context && (context.orderId || context.productId) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 2,
            py: 0.75,
            borderTop: `1px solid ${palette.line}`,
            bgcolor: '#FFFFFF',
            fontSize: 12.5,
            color: palette.muted
          }}
        >
          <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            Đang hỏi về{' '}
            <Box component="strong" sx={{ color: palette.ink }}>
              {context.orderId ? `đơn ${context.orderNumber ?? `#${context.orderId}`}` : context.productName ?? 'sản phẩm'}
            </Box>{' '}
            (gửi kèm tin nhắn tiếp theo)
          </Box>
          <IconButton size="small" aria-label="Bỏ đính kèm" onClick={onClearContext}>
            <CloseOutlined style={{ fontSize: 12 }} />
          </IconButton>
        </Box>
      )}

      {/* Khách: câu hỏi thường gặp, bấm là hỏi và nhận trả lời tự động ngay (cuộn ngang khi nhiều) */}
      {faqs.length > 0 && (
        <Box
          role="group"
          aria-label="Câu hỏi thường gặp"
          sx={{
            display: 'flex',
            gap: 0.75,
            px: 1.5,
            py: 1,
            overflowX: 'auto',
            borderTop: `1px solid ${palette.line}`,
            bgcolor: '#FFFFFF',
            scrollbarWidth: 'thin'
          }}
        >
          {faqs.map((f) => (
            <Box
              key={f.id}
              component="button"
              type="button"
              disabled={sending}
              onClick={() => pickFaq(f.id)}
              sx={{
                flexShrink: 0,
                px: 1.25,
                py: 0.5,
                border: `1px solid ${palette.accent}`,
                borderRadius: 20,
                bgcolor: '#FFFFFF',
                color: palette.accent,
                font: 'inherit',
                fontSize: 12.5,
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                '&:hover': { bgcolor: palette.bg },
                '&:disabled': { opacity: 0.5, cursor: 'default' }
              }}
            >
              {f.question}
            </Box>
          ))}
        </Box>
      )}

      {/* Ảnh đang chờ gửi: xem trước, bấm X để bỏ; gửi cùng chữ khi bấm nút gửi */}
      {pendingImage && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, pt: 1, borderTop: `1px solid ${palette.line}`, bgcolor: '#FFFFFF' }}>
          <Box sx={{ position: 'relative', width: 64, height: 64, flexShrink: 0 }}>
            <Box
              component="img"
              src={pendingImage.preview}
              alt="Ảnh sắp gửi"
              sx={{ width: 64, height: 64, objectFit: 'cover', borderRadius: '8px', border: `1px solid ${palette.line}`, opacity: pendingImage.uploading ? 0.5 : 1 }}
            />
            {pendingImage.uploading && <CircularProgress size={20} sx={{ position: 'absolute', top: 22, left: 22 }} />}
            <IconButton
              size="small"
              aria-label="Bỏ ảnh"
              onClick={clearPendingImage}
              sx={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, bgcolor: '#FFFFFF', border: `1px solid ${palette.line}`, '&:hover': { bgcolor: palette.bg } }}
            >
              <CloseOutlined style={{ fontSize: 10 }} />
            </IconButton>
          </Box>
          <Box sx={{ fontSize: 12, color: palette.muted }}>
            {pendingImage.uploading ? 'Đang tải ảnh lên…' : 'Ảnh sẽ gửi kèm tin nhắn. Bấm gửi khi sẵn sàng.'}
          </Box>
        </Box>
      )}

      {/* Ô soạn tin: Enter để gửi, Shift + Enter xuống dòng */}
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          doSend();
        }}
        sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, px: 1, py: 1, borderTop: `1px solid ${palette.line}`, bgcolor: '#FFFFFF' }}
      >
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickImage} />
        <Tooltip title="Gửi ảnh">
          <span>
            <IconButton size="small" aria-label="Gửi ảnh" disabled={sending} onClick={() => fileRef.current?.click()}>
              <PictureOutlined />
            </IconButton>
          </span>
        </Tooltip>
        {/* Cửa hàng: chọn mẫu câu trả lời nhanh để điền vào ô nhập (sửa được trước khi gửi) */}
        {quickReplies.length > 0 && (
          <>
            <Tooltip title="Mẫu câu trả lời nhanh">
              <span>
                <IconButton size="small" aria-label="Mẫu câu trả lời nhanh" disabled={sending} onClick={(e) => setQuickAnchor(e.currentTarget)}>
                  <ThunderboltOutlined />
                </IconButton>
              </span>
            </Tooltip>
            <Menu
              anchorEl={quickAnchor}
              open={Boolean(quickAnchor)}
              onClose={() => setQuickAnchor(null)}
              anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
              transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
              slotProps={{ paper: { sx: { maxWidth: 420, maxHeight: 320 } } }}
            >
              {quickReplies.map((reply) => (
                <MenuItem
                  key={reply}
                  onClick={() => {
                    setText((t) => (t.trim() ? `${t.trimEnd()} ${reply}` : reply).slice(0, 2000));
                    setQuickAnchor(null);
                  }}
                  sx={{ fontSize: 13.5, whiteSpace: 'normal', lineHeight: 1.45 }}
                >
                  {reply}
                </MenuItem>
              ))}
            </Menu>
          </>
        )}
        <InputBase
          multiline
          maxRows={4}
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 2000))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              doSend();
            }
          }}
          placeholder="Nhập tin nhắn…"
          inputProps={{ 'aria-label': 'Nội dung tin nhắn' }}
          sx={{ flex: 1, fontSize: 14, px: 1, py: 0.75, bgcolor: palette.bg, borderRadius: '10px' }}
        />
        <Tooltip title="Gửi (Enter)">
          <span>
            <IconButton
              type="submit"
              size="small"
              aria-label="Gửi tin nhắn"
              disabled={sending || pendingImage?.uploading || (!text.trim() && !pendingImage?.url && !context?.orderId && !context?.productId)}
              sx={{ color: palette.accent }}
            >
              {sending ? <CircularProgress size={16} /> : <SendOutlined />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
    </Box>
  );
}

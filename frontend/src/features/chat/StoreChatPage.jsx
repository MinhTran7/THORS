import { useCallback, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Alert, Avatar, Badge, Box, InputAdornment, TextField, Typography } from '@mui/material';
import { MessageOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from 'features/auth/AuthProvider';
import { OutlineButton } from 'features/account/components/Brand';
import { useCrumbs } from 'layouts/crumbs';
import { useDebounced } from 'features/account/hooks';
import { initials, parseUtc } from 'features/account/format';
import { brand, cardSx } from 'features/account/tokens';
import { PageHeader, filterInputSx } from 'features/account/components/Blocks';
import ChatThread from './ChatThread';
import { CHAT_STATUS_KEY, chatApi } from './api';

const pad = (n) => String(n).padStart(2, '0');
// Hôm nay: giờ; ngày khác: ngày/tháng
const shortTime = (value) => {
  const d = parseUtc(value);
  if (!d) return '';
  return d.toDateString() === new Date().toDateString() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
};

/**
 * Tin nhắn khách gửi qua "Liên hệ người bán": danh sách cuộc trò chuyện (tự cập nhật 5 giây/lần, có số tin
 * chưa đọc) bên trái, khung trò chuyện bên phải. Chủ shop và người nhà dùng chung.
 */
export default function StoreChatPage() {
  useCrumbs(['Bán hàng', 'Tin nhắn']);
  const { account } = useAuth();
  const isOwner = account?.role === 'OWNER';
  const { mutate } = useSWRConfig();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim(), 300);
  const [selectedId, setSelectedId] = useState(null);

  const list = useSWR(['chat-conversations', search], () => chatApi.conversations(search || undefined), {
    refreshInterval: 5000,
    revalidateOnFocus: true,
    keepPreviousData: true
  });
  const conversations = list.data ?? [];
  // Mẫu câu trả lời nhanh (sửa ở Kênh bán hàng > Website)
  const quickReplies = useSWR(['chat-quick-replies'], () => chatApi.quickReplies(), { revalidateOnFocus: false });
  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const refresh = useCallback(() => {
    list.mutate();
    mutate(CHAT_STATUS_KEY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutate]);

  const load = useCallback((after, before) => chatApi.thread(selectedId, after || undefined, before || undefined), [selectedId]);
  const send = useCallback((message) => chatApi.send(selectedId, message), [selectedId]);
  const markRead = useCallback((upTo) => chatApi.read(selectedId, upTo), [selectedId]);

  return (
    <Box>
      <PageHeader
        title="Tin nhắn"
        subtitle="Trả lời khách nhắn qua nút “Liên hệ người bán” trên website."
        action={
          // Cài đặt tin nhắn tự động: chỉ chủ cửa hàng
          isOwner && (
            <OutlineButton component={RouterLink} to="/messages/settings" startIcon={<SettingOutlined />}>
              Cài đặt tự động
            </OutlineButton>
          )
        }
      />

      {list.error && (
        <Alert severity={list.error.status === 503 ? 'info' : 'error'} sx={{ mb: 2, borderRadius: '10px' }}>
          {list.error.message}
        </Alert>
      )}

      <Box
        sx={{
          ...cardSx,
          overflow: 'hidden',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '320px minmax(0, 1fr)' },
          height: { xs: 'auto', md: 'calc(100vh - 230px)' },
          minHeight: 480
        }}
      >
        {/* Danh sách cuộc trò chuyện */}
        <Box
          sx={{
            borderRight: { md: `1px solid ${brand.line}` },
            display: { xs: selected ? 'none' : 'flex', md: 'flex' },
            flexDirection: 'column',
            minHeight: 0
          }}
        >
          <Box sx={{ p: 1.5, borderBottom: `1px solid ${brand.line}` }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm khách theo tên hoặc email"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined style={{ color: '#94A3B8' }} />
                    </InputAdornment>
                  )
                },
                htmlInput: { 'aria-label': 'Tìm cuộc trò chuyện' }
              }}
              sx={filterInputSx(40)}
            />
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {!list.isLoading && conversations.length === 0 && !list.error && (
              <Box sx={{ p: 3, textAlign: 'center', color: brand.muted, fontSize: 13.5 }}>
                {search ? 'Không có cuộc trò chuyện phù hợp.' : 'Chưa có khách nào nhắn tin.'}
              </Box>
            )}
            {conversations.map((c) => {
              const active = c.id === selectedId;
              return (
                <Box
                  key={c.id}
                  component="button"
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  sx={{
                    width: '100%',
                    display: 'flex',
                    gap: 1.25,
                    alignItems: 'center',
                    textAlign: 'left',
                    px: 1.5,
                    py: 1.25,
                    border: 0,
                    borderBottom: `1px solid ${brand.line}`,
                    bgcolor: active ? '#ECFBFD' : 'transparent',
                    cursor: 'pointer',
                    font: 'inherit',
                    '&:hover': { bgcolor: active ? '#ECFBFD' : '#F8FAFC' }
                  }}
                >
                  <Badge color="error" variant="dot" invisible={!c.unread} overlap="circular">
                    <Avatar src={c.avatarUrl || undefined} sx={{ width: 40, height: 40, fontSize: 14, bgcolor: '#CBD5E1' }}>
                      {initials(c.customerName)}
                    </Avatar>
                  </Badge>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Typography noWrap sx={{ fontSize: 14, fontWeight: c.unread ? 700 : 600, color: brand.ink }}>
                        {c.customerName}
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: brand.muted, flexShrink: 0 }}>{shortTime(c.lastMessageAt)}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'center' }}>
                      <Typography noWrap sx={{ fontSize: 12.5, color: c.unread ? brand.ink : brand.muted, fontWeight: c.unread ? 600 : 400 }}>
                        {c.lastSide === 'STORE' ? 'Bạn: ' : c.lastSide === 'AUTO' ? 'Tự động: ' : c.lastSide === 'BOT' || c.lastSide === 'HANDOFF' ? 'Trợ lý AI: ' : ''}
                        {c.lastText}
                      </Typography>
                      {c.unread > 0 && (
                        <Box
                          sx={{ flexShrink: 0, minWidth: 20, height: 20, px: 0.75, borderRadius: 10, bgcolor: '#EF4444', color: '#FFF', fontSize: 11.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}
                        >
                          {c.unread > 99 ? '99+' : c.unread}
                        </Box>
                      )}
                    </Box>
                  </Box>
                </Box>
              );
            })}
          </Box>
        </Box>

        {/* Khung trò chuyện */}
        <Box sx={{ display: { xs: selected ? 'flex' : 'none', md: 'flex' }, flexDirection: 'column', minHeight: { xs: 520, md: 0 } }}>
          {selected ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderBottom: `1px solid ${brand.line}` }}>
                <Box
                  component="button"
                  type="button"
                  onClick={() => setSelectedId(null)}
                  sx={{ display: { md: 'none' }, border: 0, bgcolor: 'transparent', cursor: 'pointer', fontSize: 13, color: brand.muted }}
                >
                  ← Danh sách
                </Box>
                <Avatar src={selected.avatarUrl || undefined} sx={{ width: 34, height: 34, fontSize: 13, bgcolor: '#CBD5E1' }}>
                  {initials(selected.customerName)}
                </Avatar>
                <Box sx={{ minWidth: 0 }}>
                  <Typography noWrap sx={{ fontSize: 14.5, fontWeight: 700, color: brand.ink }}>
                    {selected.customerName}
                  </Typography>
                  <Typography noWrap sx={{ fontSize: 12, color: brand.muted }}>
                    {selected.customerEmail}
                  </Typography>
                </Box>
              </Box>
              <Box sx={{ flex: 1, minHeight: 0 }}>
                <ChatThread
                  threadKey={selected.id}
                  load={load}
                  send={send}
                  markRead={markRead}
                  mySide="STORE"
                  onActivity={refresh}
                  quickReplies={quickReplies.data ?? []}
                />
              </Box>
            </>
          ) : (
            <Box sx={{ flex: 1, display: 'grid', placeItems: 'center', color: brand.muted, textAlign: 'center', p: 3 }}>
              <Box>
                <MessageOutlined style={{ fontSize: 40, color: '#CBD5E1' }} />
                <Typography sx={{ mt: 1, fontSize: 14 }}>Chọn một cuộc trò chuyện để xem và trả lời.</Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
}

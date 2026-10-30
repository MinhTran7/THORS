import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Badge, Box, Button, ButtonBase, Divider, IconButton, Popover, Tooltip, Typography } from '@mui/material';
import { BellOutlined } from '@ant-design/icons';
import { Stack } from 'features/account/components/Flex';
import { parseUtc } from 'features/account/format';
import { brand } from 'features/account/tokens';
import { entityPath, notificationsApi, POPOVER_KEY, refreshNotifications, UNREAD_KEY } from './api';

const POPUP_SIZE = 8;

function timeAgo(value) {
  const date = parseUtc(value);
  if (!date) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return 'Vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = Boolean(anchor);

  const unread = useSWR(UNREAD_KEY, notificationsApi.unreadCount, { refreshInterval: 30000 });
  // Chỉ tải danh sách khi popup đang mở.
  const list = useSWR(open ? [POPOVER_KEY] : null, () => notificationsApi.list({ page: 0, size: POPUP_SIZE }), {
    revalidateOnFocus: false
  });

  const unreadCount = unread.data?.count ?? 0;
  const items = list.data?.items ?? [];

  const close = () => {
    setAnchor(null);
    setError('');
  };

  async function openItem(item) {
    try {
      if (!item.read) {
        await notificationsApi.markRead(item.id);
        await refreshNotifications();
      }
    } catch (e) {
      setError(e.message);
      return;
    }
    close();
    const path = entityPath(item);
    if (path) navigate(path);
  }

  async function readAll() {
    setBusy(true);
    setError('');
    try {
      await notificationsApi.markAllRead();
      await refreshNotifications();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Tooltip title={unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Không có thông báo mới'}>
        <IconButton aria-label="Thông báo" aria-haspopup="true" size="small" onClick={(event) => setAnchor(event.currentTarget)}>
          <Badge color="error" badgeContent={unreadCount} max={99}>
            <BellOutlined />
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={open}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 380,
              maxWidth: 'calc(100vw - 24px)',
              mt: 1,
              borderRadius: '14px',
              border: `1px solid ${brand.line}`,
              boxShadow: '0 8px 24px rgba(31, 41, 55, 0.12)'
            }
          }
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" sx={{ color: brand.ink, fontWeight: 700 }}>
            Thông báo
          </Typography>
          <Button
            size="small"
            disabled={busy || unreadCount === 0}
            onClick={readAll}
            sx={{ textTransform: 'none', fontWeight: 600, color: brand.inkOnCyan }}
          >
            Đánh dấu tất cả đã đọc
          </Button>
        </Stack>
        <Divider />

        <Box sx={{ maxHeight: 400, overflowY: 'auto' }}>
          {(error || list.error) && (
            <Typography color="error" variant="body2" sx={{ p: 2 }}>
              {error || list.error.message}
            </Typography>
          )}
          {!list.error && !list.isLoading && items.length === 0 && (
            <Typography variant="body2" sx={{ py: 5, textAlign: 'center', color: brand.muted }}>
              Bạn chưa có thông báo nào.
            </Typography>
          )}
          {items.map((item) => (
            <ButtonBase
              key={item.id}
              onClick={() => openItem(item)}
              sx={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                px: 2,
                py: 1.5,
                borderBottom: `1px solid ${brand.line}`,
                bgcolor: item.read ? brand.surface : brand.cyanSoft,
                '&:hover': { bgcolor: item.read ? '#F6F6F1' : '#D9F4F7' }
              }}
            >
              <Stack direction="row" spacing={1.25} alignItems="flex-start">
                <Box
                  aria-label={item.read ? 'Đã đọc' : 'Chưa đọc'}
                  sx={{ width: 8, height: 8, borderRadius: '50%', mt: 0.8, flexShrink: 0, bgcolor: item.read ? 'transparent' : brand.cyanHover }}
                />
                <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                  <Typography variant="subtitle2" noWrap sx={{ color: brand.ink, fontWeight: item.read ? 500 : 700 }}>
                    {item.title}
                  </Typography>
                  <Typography
                    variant="body2"
                    sx={{
                      color: brand.muted,
                      mt: 0.25,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden'
                    }}
                  >
                    {item.message}
                  </Typography>
                  <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 0.5 }}>
                    {timeAgo(item.createdAt)}
                  </Typography>
                </Box>
              </Stack>
            </ButtonBase>
          ))}
        </Box>

        <Box sx={{ p: 1 }}>
          <Button
            fullWidth
            component={RouterLink}
            to="/notifications"
            onClick={close}
            sx={{ textTransform: 'none', fontWeight: 600, color: brand.inkOnCyan }}
          >
            Xem tất cả thông báo
          </Button>
        </Box>
      </Popover>
    </>
  );
}
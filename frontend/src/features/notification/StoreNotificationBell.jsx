import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Box, Popover } from '@mui/material';
import { parseUtc } from 'features/account/format';
import { C, SANS, SERIF, focusRing, iconBtnSx, Icon } from 'features/shop/storeTheme';
import { customerNotificationPath, notificationsApi, POPOVER_KEY, refreshNotifications, UNREAD_KEY } from './api';

/**
 * Nút chuông thông báo trên header cửa hàng (dành cho khách hàng).
 * Hiện số chưa đọc; bấm mở danh sách nhanh. Bấm một thông báo: đánh dấu đã đọc rồi mở đơn hàng liên quan,
 * hoặc trang chi tiết thông báo nếu thông báo không gắn với đơn nào.
 */

const POPUP_SIZE = 6;

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

const textBtnSx = {
  border: 0,
  p: 0,
  bgcolor: 'transparent',
  font: 'inherit',
  fontSize: 12,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: C.ink,
  textDecoration: 'underline',
  textUnderlineOffset: '3px',
  cursor: 'pointer',
  '&:hover': { color: C.accent },
  '&:disabled': { color: '#A39E97', cursor: 'default', textDecoration: 'none' },
  ...focusRing
};

export default function StoreNotificationBell() {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const open = Boolean(anchor);

  const unread = useSWR(UNREAD_KEY, notificationsApi.unreadCount, { refreshInterval: 30000 });
  // Chỉ tải danh sách khi popup đang mở
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
    navigate(customerNotificationPath(item));
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
      <Box
        component="button"
        type="button"
        aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : 'Thông báo'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(e) => setAnchor(e.currentTarget)}
        sx={{ ...iconBtnSx, position: 'relative' }}
      >
        <Icon>
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
          <path d="M10 20a2 2 0 0 0 4 0" />
        </Icon>
        {unreadCount > 0 && (
          <Box
            component="span"
            aria-hidden="true"
            sx={{
              position: 'absolute',
              top: 6,
              right: 4,
              minWidth: 18,
              height: 18,
              px: '5px',
              borderRadius: '9px',
              bgcolor: C.accent,
              color: '#FFFFFF',
              fontSize: 11,
              fontWeight: 600,
              lineHeight: '18px',
              textAlign: 'center'
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </Box>
        )}
      </Box>

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
              borderRadius: 0,
              border: `1px solid ${C.line}`,
              boxShadow: '0 12px 32px rgba(17, 17, 17, 0.10)',
              fontFamily: SANS,
              color: C.ink
            }
          }
        }}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 2,
            px: 2.5,
            pt: 2.5,
            pb: 2,
            borderBottom: `1px solid ${C.line}`
          }}
        >
          <Box component="h2" sx={{ m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: 22 }}>
            Thông báo
          </Box>
          <Box component="button" type="button" disabled={busy || unreadCount === 0} onClick={readAll} sx={textBtnSx}>
            Đọc tất cả
          </Box>
        </Box>

        <Box sx={{ maxHeight: 420, overflowY: 'auto' }}>
          {(error || list.error) && (
            <Box component="p" role="alert" sx={{ m: 0, p: 2.5, fontSize: 14, color: C.accent }}>
              {error || list.error.message}
            </Box>
          )}
          {!list.error && list.isLoading && items.length === 0 && (
            <Box component="p" sx={{ m: 0, py: 5, textAlign: 'center', fontSize: 14, color: C.muted }}>
              Đang tải…
            </Box>
          )}
          {!list.error && !list.isLoading && items.length === 0 && (
            <Box component="p" sx={{ m: 0, py: 5, textAlign: 'center', fontSize: 14, color: C.muted }}>
              Bạn chưa có thông báo nào.
            </Box>
          )}
          {items.map((item) => (
            <Box
              key={item.id}
              component="button"
              type="button"
              onClick={() => openItem(item)}
              sx={{
                display: 'flex',
                gap: 1.5,
                width: '100%',
                textAlign: 'left',
                border: 0,
                borderBottom: `1px solid ${C.line}`,
                px: 2.5,
                py: 2,
                font: 'inherit',
                color: C.ink,
                cursor: 'pointer',
                bgcolor: item.read ? '#FFFFFF' : C.sand,
                '&:hover': { bgcolor: item.read ? '#FAF8F5' : '#E8E3DB' },
                '&:hover .title': { color: C.accent },
                ...focusRing
              }}
            >
              <Box
                component="span"
                aria-label={item.read ? 'Đã đọc' : 'Chưa đọc'}
                sx={{ width: 7, height: 7, borderRadius: '50%', mt: '7px', flexShrink: 0, bgcolor: item.read ? 'transparent' : C.accent }}
              />
              <Box component="span" sx={{ minWidth: 0, flex: 1, display: 'block' }}>
                <Box
                  component="span"
                  className="title"
                  sx={{
                    display: 'block',
                    fontSize: 14,
                    fontWeight: item.read ? 500 : 600,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                >
                  {item.title}
                </Box>
                <Box
                  component="span"
                  sx={{
                    display: '-webkit-box',
                    mt: 0.5,
                    fontSize: 13,
                    color: C.muted,
                    lineHeight: 1.5,
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden'
                  }}
                >
                  {item.message}
                </Box>
                <Box component="span" sx={{ display: 'block', mt: 0.75, fontSize: 12, color: C.muted }}>
                  {timeAgo(item.createdAt)}
                </Box>
              </Box>
            </Box>
          ))}
        </Box>

        <Box
          component={RouterLink}
          to="/notifications"
          onClick={close}
          sx={{
            display: 'block',
            py: 2,
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: '0.08em',
            color: C.ink,
            textDecoration: 'none',
            '&:hover': { color: C.accent },
            ...focusRing
          }}
        >
          XEM TẤT CẢ THÔNG BÁO
        </Box>
      </Popover>
    </>
  );
}

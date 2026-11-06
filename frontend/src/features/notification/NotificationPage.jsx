import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Alert, Box, Button, ButtonBase, Typography } from '@mui/material';
import { StoreAccountShell, storePanelSx, useIsCustomer } from 'features/account/components/StoreAccount';
import { C, SERIF } from 'features/shop/storeTheme';
import { Stack } from 'features/account/components/Flex';
import { CheckOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { PAGE_SIZE } from 'features/account/constants';
import { brand, cardSx } from 'features/account/tokens';
import { formatLogDate, formatTime } from 'features/account/format';
import { OutlineButton } from 'features/account/components/Brand';
import { StatusPill } from 'features/account/components/Chips';
import { FilterSelect, PageHeader, Pager, Toolbar } from 'features/account/components/Blocks';
import { useToast } from 'features/account/components/Toast';
import { notificationTypeLabel } from './constants';
import { customerNotificationPath, entityPath, notificationsApi, refreshNotifications, UNREAD_KEY } from './api';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả thông báo' },
  { value: 'unread', label: 'Chưa đọc' }
];

export default function NotificationPage() {
  useCrumbs(['Thông báo']);
  const navigate = useNavigate();
  const isCustomer = useIsCustomer();
  const [toast, showToast] = useToast();
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);

  const params = { unreadOnly: filter === 'unread', page, size: PAGE_SIZE };
  const list = useSWR(['notifications', params], () => notificationsApi.list(params), {
    keepPreviousData: true,
    revalidateOnFocus: false
  });
  const unread = useSWR(UNREAD_KEY, notificationsApi.unreadCount, { revalidateOnFocus: false });

  const items = list.data?.items ?? [];
  const unreadCount = unread.data?.count ?? 0;

  async function open(item) {
    try {
      if (!item.read) {
        await notificationsApi.markRead(item.id);
        await refreshNotifications();
      }
    } catch (e) {
      showToast(e.message, 'error');
      return;
    }
    // Khách: thông báo không gắn đơn hàng thì mở trang chi tiết thông báo
    const path = isCustomer ? customerNotificationPath(item) : entityPath(item);
    if (path) navigate(path);
  }

  async function readAll() {
    setBusy(true);
    try {
      await notificationsApi.markAllRead();
      await refreshNotifications();
      showToast('Đã đánh dấu tất cả thông báo là đã đọc.');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (isCustomer) {
    return (
      <StoreAccountShell
        title="Thông báo"
        subtitle={unreadCount > 0 ? `Bạn có ${unreadCount} thông báo chưa đọc.` : 'Bạn đã đọc hết thông báo.'}
        action={
          <Button variant="outlined" disabled={busy || unreadCount === 0} onClick={readAll} sx={{ px: 2.5, py: 1.25 }}>
            Đánh dấu tất cả đã đọc
          </Button>
        }
      >
        {/* Lọc: Tất cả / Chưa đọc, kiểu tab gạch chân như trang đơn hàng */}
        <Box role="tablist" aria-label="Lọc thông báo" sx={{ display: 'flex', gap: 3, borderBottom: `1px solid ${C.line}`, mb: 3 }}>
          {FILTER_OPTIONS.map((option) => {
            const selected = filter === option.value;
            return (
              <Box
                key={option.value}
                component="button"
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => {
                  setFilter(option.value);
                  setPage(0);
                }}
                sx={{
                  border: 0,
                  bgcolor: 'transparent',
                  font: 'inherit',
                  fontSize: 14,
                  fontWeight: selected ? 600 : 500,
                  color: selected ? C.ink : C.muted,
                  px: 0,
                  py: 1.5,
                  mb: '-1px',
                  borderBottom: `2px solid ${selected ? C.ink : 'transparent'}`,
                  cursor: 'pointer',
                  '&:hover': { color: C.ink }
                }}
              >
                {option.value === 'all' ? 'Tất cả' : 'Chưa đọc'}
              </Box>
            );
          })}
        </Box>

        {list.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {list.error.message}
          </Alert>
        )}

        {!list.error && items.length === 0 && !list.isLoading && (
          <Box sx={{ bgcolor: C.sand, py: { xs: 8, sm: 10 }, px: 2, textAlign: 'center' }}>
            <Box component="h2" sx={{ m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 24, sm: 30 } }}>
              {filter === 'unread' ? 'Không có thông báo chưa đọc' : 'Bạn chưa có thông báo nào'}
            </Box>
            <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 15, color: C.muted }}>
              Cập nhật về đơn hàng và tài khoản sẽ xuất hiện tại đây.
            </Box>
          </Box>
        )}

        {items.length > 0 && (
          <Box sx={{ ...storePanelSx }}>
            {items.map((item, index) => (
              <Box
                key={item.id}
                component="button"
                type="button"
                onClick={() => open(item)}
                sx={{
                  display: 'flex',
                  gap: 2,
                  width: '100%',
                  textAlign: 'left',
                  border: 0,
                  borderTop: index > 0 ? `1px solid ${C.line}` : 0,
                  px: { xs: 2.5, sm: 3.5 },
                  py: 2.75,
                  font: 'inherit',
                  color: C.ink,
                  cursor: 'pointer',
                  bgcolor: item.read ? '#FFFFFF' : C.sand,
                  '&:hover': { bgcolor: item.read ? '#FAF8F5' : '#E8E3DB' },
                  '&:hover .title': { color: C.accent },
                  '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: '-2px' }
                }}
              >
                <Box
                  component="span"
                  aria-label={item.read ? 'Đã đọc' : 'Chưa đọc'}
                  sx={{ width: 8, height: 8, borderRadius: '50%', mt: '8px', flexShrink: 0, bgcolor: item.read ? 'transparent' : C.accent }}
                />
                <Box component="span" sx={{ display: 'block', minWidth: 0, flex: 1 }}>
                  <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 1.5, rowGap: 0.5 }}>
                    <Box component="span" className="title" sx={{ fontSize: 15, fontWeight: item.read ? 500 : 600 }}>
                      {item.title}
                    </Box>
                    <Box
                      component="span"
                      sx={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted }}
                    >
                      {notificationTypeLabel(item.type)}
                    </Box>
                  </Box>
                  <Box
                    component="span"
                    sx={{ display: 'block', mt: 0.75, fontSize: 14, color: C.muted, lineHeight: 1.6, whiteSpace: 'pre-line' }}
                  >
                    {item.message}
                  </Box>
                  <Box component="span" sx={{ display: 'block', mt: 1, fontSize: 12, color: C.muted }}>
                    {formatLogDate(item.createdAt)} · {formatTime(item.createdAt)}
                  </Box>
                </Box>
                <Box component="span" aria-hidden="true" sx={{ alignSelf: 'center', fontSize: 18, color: C.muted }}>
                  →
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {items.length > 0 && (
          <Box
            sx={{
              mt: 1,
              '& .MuiButton-root[aria-current="page"]': { bgcolor: C.ink, color: '#FFFFFF' }
            }}
          >
            <Pager
              page={page}
              totalPages={list.data?.totalPages ?? 0}
              total={list.data?.total ?? 0}
              size={PAGE_SIZE}
              noun="thông báo"
              onPage={setPage}
            />
          </Box>
        )}
        {toast}
      </StoreAccountShell>
    );
  }

  return (
    <Box>
      <PageHeader
        title="Thông báo"
        subtitle={unreadCount > 0 ? `Bạn có ${unreadCount} thông báo chưa đọc.` : 'Bạn đã đọc hết thông báo.'}
        action={
          <OutlineButton startIcon={<CheckOutlined />} disabled={busy || unreadCount === 0} onClick={readAll}>
            Đánh dấu tất cả đã đọc
          </OutlineButton>
        }
      />

      <Toolbar>
        <FilterSelect
          label="Lọc thông báo"
          value={filter}
          onChange={(value) => {
            setFilter(value);
            setPage(0);
          }}
          options={FILTER_OPTIONS}
        />
      </Toolbar>

      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {list.error && (
          <Typography color="error" sx={{ p: 2 }}>
            {list.error.message}
          </Typography>
        )}

        {!list.error && items.length === 0 && !list.isLoading && (
          <Typography sx={{ py: 6, textAlign: 'center', color: brand.muted }}>
            {filter === 'unread' ? 'Không có thông báo chưa đọc.' : 'Bạn chưa có thông báo nào.'}
          </Typography>
        )}

        {items.map((item) => (
          <ButtonBase
            key={item.id}
            onClick={() => open(item)}
            sx={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              px: 2.5,
              py: 2,
              borderBottom: `1px solid ${brand.line}`,
              bgcolor: item.read ? brand.surface : brand.cyanSoft,
              '&:hover': { bgcolor: item.read ? '#F6F6F1' : '#D9F4F7' }
            }}
          >
            <Stack direction="row" spacing={1.5} alignItems="flex-start">
              <Box
                aria-label={item.read ? 'Đã đọc' : 'Chưa đọc'}
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  mt: 0.9,
                  flexShrink: 0,
                  bgcolor: item.read ? 'transparent' : brand.cyanHover
                }}
              />
              <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap' }}>
                  <Typography variant="subtitle2" sx={{ color: brand.ink, fontWeight: item.read ? 500 : 700 }}>
                    {item.title}
                  </Typography>
                  <StatusPill label={notificationTypeLabel(item.type)} />
                </Stack>
                <Typography variant="body2" sx={{ color: brand.muted, mt: 0.5, whiteSpace: 'pre-line' }}>
                  {item.message}
                </Typography>
                <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 0.75 }}>
                  {formatLogDate(item.createdAt)} · {formatTime(item.createdAt)}
                </Typography>
              </Box>
            </Stack>
          </ButtonBase>
        ))}

        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={PAGE_SIZE}
          noun="thông báo"
          onPage={setPage}
        />
      </Box>
      {toast}
    </Box>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Box, ButtonBase, Typography } from '@mui/material';
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
import { entityPath, notificationsApi, refreshNotifications, UNREAD_KEY } from './api';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Tất cả thông báo' },
  { value: 'unread', label: 'Chưa đọc' }
];

export default function NotificationPage() {
  useCrumbs(['Thông báo']);
  const navigate = useNavigate();
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
    const path = entityPath(item);
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
                sx={{ width: 8, height: 8, borderRadius: '50%', mt: 0.9, flexShrink: 0, bgcolor: item.read ? 'transparent' : brand.cyanHover }}
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
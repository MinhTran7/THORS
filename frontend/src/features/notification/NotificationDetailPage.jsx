import { useEffect } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';
import { BellOutlined } from '@ant-design/icons';
import useSWR from 'swr';
import { Alert, Box, Button, Typography } from '@mui/material';
import { useCrumbs } from 'layouts/crumbs';
import { formatLogDate, formatTime } from 'features/account/format';
import { brand, cardSx } from 'features/account/tokens';
import { PageHeader } from 'features/account/components/Blocks';
import { StoreAccountShell, storePanelSx, useIsCustomer } from 'features/account/components/StoreAccount';
import { C, SERIF } from 'features/shop/storeTheme';
import { notificationTypeLabel } from './constants';
import { entityPath, notificationsApi, refreshNotifications } from './api';

const BACK = { to: '/notifications', label: 'Tất cả thông báo', icon: <BellOutlined /> };

const RELATED_LABEL = { ORDER: 'Xem đơn hàng', USER: 'Mở trang tài khoản', PROMOTION: 'Xem khuyến mãi' };

/** /notifications/:id: xem đầy đủ một thông báo; mở trang là coi như đã đọc. */
export default function NotificationDetailPage() {
  const { id } = useParams();
  const isCustomer = useIsCustomer();
  const { data: item, error, isLoading } = useSWR(['notification', id], () => notificationsApi.detail(id), { revalidateOnFocus: false });
  useCrumbs(['Thông báo', item?.title ?? 'Chi tiết']);

  // Đánh dấu đã đọc một lần khi mở thông báo chưa đọc, rồi cập nhật số trên chuông
  const unreadId = item && !item.read ? item.id : null;
  useEffect(() => {
    if (unreadId == null) return;
    notificationsApi
      .markRead(unreadId)
      .then(refreshNotifications)
      .catch(() => {});
  }, [unreadId]);

  const related = item ? entityPath(item) : null;
  const when = item ? `${formatLogDate(item.createdAt)} · ${formatTime(item.createdAt)}` : '';

  const body = (
    <>
      {error && <Alert severity="error">{error.status === 404 ? 'Không tìm thấy thông báo này.' : error.message}</Alert>}
      {isLoading && !item && <Typography sx={{ color: isCustomer ? C.muted : brand.muted }}>Đang tải thông báo…</Typography>}
      {item && (
        <Box component="article" sx={{ ...(isCustomer ? storePanelSx : cardSx), p: { xs: 3, sm: 5 }, maxWidth: 760 }}>
          <Box
            sx={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: isCustomer ? C.accent : brand.muted
            }}
          >
            {notificationTypeLabel(item.type)}
          </Box>
          <Box
            component="h2"
            sx={{
              m: 0,
              mt: 1.5,
              ...(isCustomer ? { fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 26, sm: 32 } } : { fontSize: 22, fontWeight: 600 }),
              lineHeight: 1.25,
              color: isCustomer ? C.ink : brand.ink
            }}
          >
            {item.title}
          </Box>
          <Box sx={{ mt: 1, fontSize: 13, color: isCustomer ? C.muted : brand.muted }}>{when}</Box>
          <Box
            sx={{
              mt: 3,
              pt: 3,
              borderTop: `1px solid ${isCustomer ? C.line : brand.line}`,
              fontSize: 15,
              lineHeight: 1.75,
              whiteSpace: 'pre-line',
              color: isCustomer ? C.ink : brand.ink
            }}
          >
            {item.message}
          </Box>
          {related && (
            <Button component={RouterLink} to={related} variant="contained" disableElevation sx={{ mt: 4, px: 3, py: 1.25 }}>
              {RELATED_LABEL[item.relatedEntityType] ?? 'Xem chi tiết'}
            </Button>
          )}
        </Box>
      )}
    </>
  );

  if (isCustomer) {
    return (
      <StoreAccountShell back={BACK} eyebrow="Thông báo" title="Chi tiết thông báo">
        {body}
      </StoreAccountShell>
    );
  }
  return (
    <Box>
      <PageHeader back={BACK} title="Chi tiết thông báo" />
      {body}
    </Box>
  );
}

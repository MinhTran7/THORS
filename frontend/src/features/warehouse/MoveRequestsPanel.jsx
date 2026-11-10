import { useState } from 'react';
import useSWR from 'swr';
import { Alert, Box, Button, Chip, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { ActionDialog } from './components';
import { number, when } from './model';

const STATUS = {
  PENDING: ['Chờ xác nhận', 'warning'],
  APPROVED: ['Đã xác nhận', 'success'],
  REJECTED: ['Bị từ chối', 'error'],
  CANCELLED: ['Đã hủy', 'default']
};

const describe = (r) =>
  `${r.from_label ? `Chuyển từ kệ ${r.from_label}` : 'Xếp từ hàng chưa xếp'} → ${r.to_label ? `kệ ${r.to_label}` : 'chưa xếp vị trí'}`;

/**
 * Shelving / moving requests sent by family members. The owner confirms (the move is saved then)
 * or rejects; the sender may withdraw a pending one. Hidden when there is nothing to show.
 */
export default function MoveRequestsPanel() {
  const { owner, account, busy, run } = useWarehouse();
  const [view, setView] = useState('PENDING');
  const [action, setAction] = useState(null);
  const { data, error } = useSWR(`/warehouse/move-requests${view === 'PENDING' ? '?status=PENDING' : ''}`, api, {
    revalidateOnFocus: true
  });
  const rows = (data || []).filter((r) => owner || view === 'PENDING' || r.requested_by === account.id).slice(0, 30);
  if (!error && view === 'PENDING' && !rows.length) return null;

  return (
    <MainCard
      title={owner ? 'Yêu cầu xếp / chuyển kệ chờ xác nhận' : 'Yêu cầu xếp / chuyển kệ đã gửi'}
      sx={{ mb: 2 }}
      secondary={
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_, v) => v && setView(v)}>
          <ToggleButton value="PENDING">Đang chờ</ToggleButton>
          <ToggleButton value="ALL">Gần đây</ToggleButton>
        </ToggleButtonGroup>
      }
    >
      {error && <Alert severity="error">{error.message}</Alert>}
      {!error && !rows.length && <Typography color="text.secondary">Chưa có yêu cầu nào.</Typography>}
      <Stack spacing={1.5}>
        {rows.map((r) => {
          const [label, tone] = STATUS[r.status] || [r.status, 'default'];
          const pending = r.status === 'PENDING';
          return (
            <Box
              key={r.request_id}
              sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 1.5, display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}
            >
              <Box sx={{ flex: 1, minWidth: 260 }}>
                <Typography sx={{ fontWeight: 600 }}>
                  {r.product_name} · {r.color} · {r.size} — {number(r.quantity)} sản phẩm
                </Typography>
                <Typography variant="body2">{describe(r)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {r.requester_name} gửi lúc {when(r.requested_at)}
                  {r.decided_at && ` · ${r.decider_name || ''} xử lý lúc ${when(r.decided_at)}`}
                  {r.rejection_reason && ` · Lý do: ${r.rejection_reason}`}
                  {r.description && ` · Mô tả vị trí: ${r.description}`}
                </Typography>
              </Box>
              <Chip size="small" color={tone} label={label} />
              {pending && owner && (
                <>
                  <Button size="small" variant="contained" disabled={busy} onClick={() => setAction({ r, kind: 'approve' })}>
                    Xác nhận
                  </Button>
                  <Button size="small" color="warning" disabled={busy} onClick={() => setAction({ r, kind: 'reject' })}>
                    Từ chối
                  </Button>
                </>
              )}
              {pending && !owner && r.requested_by === account.id && (
                <Button size="small" color="error" disabled={busy} onClick={() => setAction({ r, kind: 'cancel' })}>
                  Hủy yêu cầu
                </Button>
              )}
            </Box>
          );
        })}
      </Stack>
      {action && (
        <ActionDialog
          title={
            action.kind === 'approve' ? 'Xác nhận xếp / chuyển kệ' : action.kind === 'reject' ? 'Từ chối yêu cầu' : 'Hủy yêu cầu'
          }
          text={
            action.kind === 'approve'
              ? `${describe(action.r)}: ${number(action.r.quantity)} ${action.r.product_name} · ${action.r.color} · ${action.r.size}. Vị trí trong hệ thống sẽ được cập nhật ngay; tổng tồn không đổi.`
              : action.kind === 'reject'
                ? 'Kho không thay đổi. Người gửi sẽ nhận thông báo kèm lý do để đưa hàng về chỗ cũ.'
                : 'Kho không thay đổi. Nhớ đưa hàng về chỗ cũ nếu đã chuyển.'
          }
          reason={action.kind === 'reject'}
          onClose={() => setAction(null)}
          onConfirm={(reason) =>
            run(
              () =>
                api(`/warehouse/move-requests/${action.r.request_id}/${action.kind}`, {
                  method: 'POST',
                  ...(action.kind === 'reject' ? { body: { reason } } : {})
                }),
              action.kind === 'approve' ? 'Đã xác nhận, vị trí đã được cập nhật.' : 'Đã cập nhật yêu cầu.'
            )
          }
        />
      )}
    </MainCard>
  );
}

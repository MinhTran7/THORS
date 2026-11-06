import useSWR from 'swr';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { Status } from './components';
import { docCode, money, number, orderCode, progressColor, progressLabel, statusText, typeLabel, variantLabel, when } from './model';

export function Progress({ value }) {
  return <Chip size="small" label={progressLabel[value] || value} color={progressColor[value] || 'default'} />;
}

const dash = (v) => (Number(v) ? number(v) : '—');
// No receiving obligation before confirmation (draft/pending/rejected/cancelled): show "—", not 0.
const shortfall = (d, line) =>
  d.progress === 'NOT_APPLICABLE'
    ? '—'
    : number(d.status === 'CLOSED' ? line.closed_short_quantity : line.remaining_quantity);

/** Purchase order detail; every number comes from GET /warehouse/orders/{id}. */
export default function OrderDetail({ id, onClose, onEdit, onAction, onOpenDocument }) {
  const { owner, busy, documents } = useWarehouse();
  const { data: d, error } = useSWR(`/warehouse/orders/${id}`, api, { revalidateOnFocus: true });
  const raw = documents.find((x) => x.receipt_id === id);

  if (error)
    return (
      <Dialog open onClose={onClose}>
        <DialogContent>
          <Alert severity="error">{error.message}</Alert>
        </DialogContent>
      </Dialog>
    );
  if (!d)
    return (
      <Dialog open onClose={onClose}>
        <DialogContent>
          <CircularProgress aria-label="Đang tải phiếu đặt" />
        </DialogContent>
      </Dialog>
    );

  const hasOver = d.items.some((i) => i.over_quantity > 0);
  const hasSub = d.items.some((i) => i.received_substitute > 0);
  const hasReturn = d.items.some((i) => i.returned_quantity > 0);
  const act = (kind) => onAction({ ...(raw || {}), ...d, receipt_type: 'PURCHASE_ORDER' }, kind);

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xl">
      <DialogTitle>
        {orderCode(d.receipt_id)} · Phiếu đặt hàng nhập <Status value={d.status} /> <Progress value={d.progress} />
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            Nhà cung cấp: <b>{d.manufacturer_name}</b> · Ngày đặt: {when(d.receipt_date)} · Người lập: {d.creator_name}
            {d.confirmed_at && ` · Xác nhận: ${d.confirmer_name} · ${when(d.confirmed_at)}`}
          </Typography>
          {d.note && <Typography>Ghi chú: {d.note}</Typography>}
          {d.rejection_reason && (
            <Alert severity="warning">
              {d.status === 'CANCELLED' ? 'Lý do hủy' : 'Lý do từ chối'}: {d.rejection_reason}
            </Alert>
          )}
          {d.close_reason && (
            <Alert severity="info">
              Đóng phần còn thiếu ({number(d.closed_short_quantity)} sản phẩm): {d.close_reason} · {when(d.closed_at)}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary">
            Trạng thái chứng từ và tiến độ nhận hiển thị riêng. Tiến độ tính từ các phiếu nhập đã xác nhận; số lượng đặt ban đầu không bị
            sửa theo số thực nhập.
          </Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Sản phẩm · màu · size</TableCell>
                  <TableCell align="right">Đơn giá đặt</TableCell>
                  <TableCell align="right">Đặt</TableCell>
                  <TableCell align="right">Đã nhập</TableCell>
                  {hasSub && <TableCell align="right">Nhận thay thế</TableCell>}
                  {hasOver && <TableCell align="right">Nhận vượt</TableCell>}
                  <TableCell align="right">{d.status === 'CLOSED' ? 'Đã đóng thiếu' : 'Còn thiếu'}</TableCell>
                  <TableCell align="right">Chờ duyệt nhập</TableCell>
                  {hasReturn && <TableCell align="right">Đã trả NCC</TableCell>}
                  <TableCell align="right">Thành tiền đặt</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {d.items.map((i) => (
                  <TableRow key={i.receipt_item_id}>
                    <TableCell>{variantLabel(i)}</TableCell>
                    <TableCell align="right">{money(i.unit_price)}</TableCell>
                    <TableCell align="right">{number(i.ordered_quantity)}</TableCell>
                    <TableCell align="right">{number(i.received_exact)}</TableCell>
                    {hasSub && <TableCell align="right">{dash(i.received_substitute)}</TableCell>}
                    {hasOver && <TableCell align="right">{dash(i.over_quantity)}</TableCell>}
                    <TableCell align="right">{shortfall(d, i)}</TableCell>
                    <TableCell align="right">{dash(i.pending_receipt_quantity)}</TableCell>
                    {hasReturn && <TableCell align="right">{dash(i.returned_quantity)}</TableCell>}
                    <TableCell align="right">{money(i.ordered_quantity * i.unit_price)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
          <Typography variant="h5">
            Đặt {number(d.ordered_quantity)} · đã nhập {number(d.fulfilled_quantity)} ·{' '}
            {d.status === 'CLOSED' ? `đóng thiếu ${shortfall(d, d)}` : `còn thiếu ${shortfall(d, d)}`} · Tổng
            tiền đặt {money(d.total_amount)}
          </Typography>
          {hasReturn && (
            <Alert severity="info">
              Số đã trả nhà cung cấp được hiển thị để đối chiếu. Hiện tại việc trả hàng không mở lại phần còn thiếu của đơn đặt
              (chưa có chỗ lưu lựa chọn “chờ giao bù”).
            </Alert>
          )}
          <Typography variant="subtitle2">Phiếu nhập và phiếu trả liên quan (chỉ xem; lập phiếu nhập tại trang Nhập hàng)</Typography>
          {!d.related.length && <Typography color="text.secondary">Chưa có phiếu nhập nào.</Typography>}
          {d.related.map((r) => (
            <Typography key={r.receipt_id}>
              <MuiLink component="button" type="button" onClick={() => onOpenDocument(r.receipt_id)}>
                {docCode(r)}
              </MuiLink>{' '}
              · {typeLabel[r.receipt_type]} · {number(r.quantity)} sản phẩm · {money(r.amount)} · {statusText(r.status, r.receipt_type)} · {r.creator_name}{' '}
              · {when(r.confirmed_at || r.receipt_date)}
            </Typography>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Đóng</Button>
        {owner && d.status === 'DRAFT' && raw && (
          <>
            <Button disabled={busy} onClick={() => onEdit(raw)}>
              Sửa nháp
            </Button>
          </>
        )}
        {owner && ['DRAFT', 'PENDING_CONFIRMATION'].includes(d.status) && (
          <Button variant="contained" disabled={busy} onClick={() => act('confirm')}>
            Xác nhận đặt hàng
          </Button>
        )}
        {owner && d.status === 'PENDING_CONFIRMATION' && (
          <Button color="warning" disabled={busy} onClick={() => act('reject')}>
            Từ chối
          </Button>
        )}
        {owner && (['DRAFT', 'PENDING_CONFIRMATION'].includes(d.status) || d.can_cancel_confirmed) && (
          <Button color="error" disabled={busy} onClick={() => act('cancel')}>
            Hủy phiếu
          </Button>
        )}
        {owner && d.status === 'CONFIRMED' && d.remaining_quantity > 0 && (
          <Button color="warning" disabled={busy} onClick={() => act('close')}>
            Đóng phần còn thiếu
          </Button>
        )}
        {owner && d.status === 'CONFIRMED' && d.remaining_quantity === 0 && (
          <Button disabled={busy} onClick={() => act('close')}>
            Đóng đơn đã nhận đủ
          </Button>
        )}
        {owner && (
          <Button disabled={busy} onClick={() => act('copy')}>
            Sao chép thành phiếu nháp
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

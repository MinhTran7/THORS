import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { useSearchParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { Pager } from 'features/account/components/Blocks';
import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { Status, Title } from './components';
import { DocumentAction, DocumentDetail } from './DocumentsPage';
import DocumentForm from './DocumentForm';
import OrderDetail, { Progress } from './OrderDetail';
import { money, number, orderCode, progressLabel, statusLabel, when } from './model';

/** "Đặt hàng nhập" list: search, filter and paging are done by the backend. */
export default function OrdersPage() {
  const { owner } = useWarehouse();
  const [params] = useSearchParams();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState('');
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(20);
  const [detail, setDetail] = useState(params.get('id') ? Number(params.get('id')) : null);
  const [otherDoc, setOtherDoc] = useState(null);
  const [form, setForm] = useState(null);
  const [action, setAction] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const qs = new URLSearchParams({ page, size });
  if (search) qs.set('q', search);
  if (status) qs.set('status', status);
  if (progress) qs.set('progress', progress);
  const { data, error, isLoading } = useSWR(`/warehouse/orders?${qs}`, api, { keepPreviousData: true });
  const rows = data?.items || [];

  return (
    <>
      <Title
        title="Đặt hàng nhập"
        subtitle="Đặt theo từng màu/size với nhà cung cấp; theo dõi trạng thái chứng từ và tiến độ nhận hàng riêng."
        action={
          <Button variant="contained" onClick={() => setForm({})}>
            Tạo phiếu đặt hàng
          </Button>
        }
      />
      <MainCard>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} useFlexGap flexWrap="wrap" sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder="Tìm mã phiếu, nhà cung cấp, người lập"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            sx={{ minWidth: 280, flex: 1 }}
            slotProps={{ htmlInput: { 'aria-label': 'Tìm phiếu đặt' } }}
          />
          <TextField
            size="small"
            select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 180 }}
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Lọc trạng thái chứng từ' } } }}
          >
            <MenuItem value="">Mọi trạng thái chứng từ</MenuItem>
            {['DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED', 'CLOSED'].map((s) => (
              <MenuItem key={s} value={s}>
                {statusLabel[s]}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            select
            value={progress}
            onChange={(e) => {
              setProgress(e.target.value);
              setPage(0);
            }}
            sx={{ minWidth: 180 }}
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Lọc tiến độ nhận' } } }}
          >
            <MenuItem value="">Mọi tiến độ nhận</MenuItem>
            {Object.entries(progressLabel).map(([k, v]) => (
              <MenuItem key={k} value={k}>
                {v}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        {error && <Alert severity="error">{error.message}</Alert>}
        <TableContainer sx={{ opacity: isLoading ? 0.6 : 1 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Mã phiếu</TableCell>
                <TableCell>Nhà cung cấp</TableCell>
                <TableCell>Ngày đặt</TableCell>
                <TableCell align="right">Tổng tiền</TableCell>
                <TableCell>Trạng thái chứng từ</TableCell>
                <TableCell>Tiến độ nhận</TableCell>
                <TableCell align="right">Đã nhập / Đặt</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((d) => (
                <TableRow key={d.receipt_id} hover sx={{ cursor: 'pointer' }} onClick={() => setDetail(d.receipt_id)}>
                  <TableCell>
                    <Typography color="primary" variant="subtitle2">
                      {orderCode(d.receipt_id)}
                    </Typography>
                  </TableCell>
                  <TableCell>{d.manufacturer_name}</TableCell>
                  <TableCell>{when(d.receipt_date)}</TableCell>
                  <TableCell align="right">{money(d.total_amount)}</TableCell>
                  <TableCell>
                    <Status value={d.status} />
                  </TableCell>
                  <TableCell>
                    <Progress value={d.progress} />
                  </TableCell>
                  <TableCell align="right">
                    {number(d.fulfilled_quantity)} / {number(d.ordered_quantity)}
                    {d.over_quantity > 0 && (
                      <Typography variant="caption" component="div" color="warning.main">
                        Vượt {number(d.over_quantity)}
                      </Typography>
                    )}
                    {d.pending_receipt_quantity > 0 && (
                      <Typography variant="caption" component="div" color="text.secondary">
                        Chờ duyệt nhập {number(d.pending_receipt_quantity)}
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!rows.length && !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} sx={{ py: 5, textAlign: 'center', color: 'text.secondary' }}>
                    Chưa có phiếu đặt phù hợp.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <Pager
          page={Math.min(page, Math.max(0, Math.ceil((data?.total || 0) / size) - 1))}
          total={data?.total || 0}
          size={size}
          noun="phiếu đặt"
          onPage={setPage}
          onSize={(value) => {
            setSize(value);
            setPage(0);
          }}
          sizeOptions={[20, 50, 100]}
        />
      </MainCard>
      {!owner && (
        <Box sx={{ mt: 2 }}>
          <Alert severity="info">
            Bạn lập phiếu đặt nháp rồi bấm “Gửi chủ cửa hàng xác nhận”. Chủ cửa hàng có thể sửa trước khi xác nhận. Hàng chưa có trong hệ
            thống: ghi vào ghi chú để chủ cửa hàng tạo sản phẩm.
          </Alert>
        </Box>
      )}
      {detail && (
        <OrderDetail
          id={detail}
          onClose={() => setDetail(null)}
          onEdit={(d) => {
            setDetail(null);
            setForm({ document: d });
          }}
          onAction={(doc, kind) => setAction({ doc, kind })}
          onOpenDocument={(id) => setOtherDoc(id)}
        />
      )}
      {otherDoc && (
        <DocumentDetail id={otherDoc} readOnly onClose={() => setOtherDoc(null)} />
      )}
      {form && <DocumentForm type="PURCHASE_ORDER" document={form.document} onClose={() => setForm(null)} />}
      {action && (
        <DocumentAction
          action={action}
          onClose={() => setAction(null)}
          onDone={(result) => {
            if (action.kind === 'copy' && result?.receipt_id) setDetail(result.receipt_id);
          }}
        />
      )}
    </>
  );
}

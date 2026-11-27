import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  Box,
  CircularProgress,
  InputAdornment,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import { SearchOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { DateRangeFilter, FilterResetButton, Pager } from 'features/account/components/Blocks';
import { useDebounced } from 'features/account/hooks';
import { useCrumbs } from 'layouts/crumbs';
import { getSales, getSellers } from 'services/salesService';
import PaymentBadge from '../components/PaymentBadge';
import { C, cardSx, filterInputSx } from '../theme';
import { money, splitDateTime } from '../utils';
import { PAGE_TYPE, pageTitleSx } from 'themes/pageType';

const PAYMENTS = [
  ['CASH', 'Tiền mặt'],
  ['TRANSFER', 'Chuyển khoản']
];

const PAGE_SIZE = 8;

export default function InStoreSalesHistoryPage() {
  useCrumbs(['Bán hàng tại quầy', 'Danh sách hóa đơn']);

  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sellerId, setSellerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [page, setPage] = useState(0);

  const debouncedSearch = useDebounced(q.trim(), 350);

  // Lấy danh sách người bán để phục vụ bộ lọc
  const { data: sellersData } = useSWR('in-store-sellers', getSellers, { revalidateOnFocus: false });
  const sellers = sellersData || [];

  const params = {
    q: debouncedSearch || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    sellerId: sellerId || undefined,
    paymentMethod: paymentMethod || undefined,
    page,
    size: PAGE_SIZE
  };

  const dateError = fromDate && toDate && fromDate > toDate ? 'Từ ngày không được sau đến ngày.' : '';
  const swrKey = dateError ? null : ['in-store-sales', JSON.stringify(params)];

  const { data, error, isLoading } = useSWR(swrKey, () => getSales(params), { keepPreviousData: true, revalidateOnFocus: false });

  const items = dateError ? [] : (data?.items ?? []);
  const total = dateError ? 0 : (data?.total ?? 0);
  const totalPages = dateError ? 0 : (data?.totalPages ?? 0);

  function handleSearchChange(val) {
    setQ(val);
    setPage(0);
  }

  function handleResetFilters() {
    setQ('');
    setFromDate('');
    setToDate('');
    setSellerId('');
    setPaymentMethod('');
    setPage(0);
  }

  return (
    <Box sx={{ color: C.text, pb: 4 }}>
      {/* ─── TIÊU ĐỀ TRÊN CÙNG: DANH SÁCH HÓA ĐƠN ─── */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h3" sx={{ ...pageTitleSx, color: C.text }}>
          Danh sách hóa đơn
        </Typography>
      </Box>

      {/* ─── THANH BỘ LỌC PHÍA TRÊN ─── */}
      <Box
        sx={{
          mb: 3,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            // Chỉ dàn 1 hàng khi đủ chỗ (lg); cột co giãn để không tràn ngang
            lg: 'minmax(150px, 1.8fr) minmax(120px, 140px) minmax(120px, 140px) 130px 130px 130px auto'
          },
          gap: { xs: 1.5, lg: 2 },
          alignItems: 'flex-end'
        }}
      >
        {/* Tìm kiếm theo mã hóa đơn */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>Tìm kiếm hóa đơn</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Tìm theo mã hóa đơn..."
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: C.subtle, fontSize: 16 }} />
                  </InputAdornment>
                )
              }
            }}
            sx={{ '& .MuiOutlinedInput-root': filterInputSx }}
          />
        </Box>

        {/* Lọc theo người bán */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>Người bán</Typography>
          <Select
            fullWidth
            size="small"
            displayEmpty
            value={sellerId}
            onChange={(e) => {
              setSellerId(e.target.value);
              setPage(0);
            }}
            renderValue={(val) => {
              if (!val) return 'Tất cả';
              const found = sellers.find((s) => String(s.id) === String(val));
              return found ? found.name : 'Tất cả';
            }}
            sx={filterInputSx}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {sellers.map((s) => (
              <MenuItem key={s.id} value={String(s.id)}>
                {s.name}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {/* Lọc theo phương thức thanh toán */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>Phương thức</Typography>
          <Select
            fullWidth
            size="small"
            displayEmpty
            value={paymentMethod}
            onChange={(e) => {
              setPaymentMethod(e.target.value);
              setPage(0);
            }}
            renderValue={(val) => PAYMENTS.find(([key]) => key === val)?.[1] ?? 'Tất cả'}
            sx={filterInputSx}
          >
            <MenuItem value="">Tất cả</MenuItem>
            {PAYMENTS.map(([key, label]) => (
              <MenuItem key={key} value={key}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {/* Từ ngày / Đến ngày: ô lọc ngày dùng chung (chặn ngày tương lai, Từ không sau Đến) */}
        <DateRangeFilter
          from={fromDate}
          to={toDate}
          width="100%"
          presetWidth="100%"
          onChange={({ from, to }) => {
            setFromDate(from);
            setToDate(to);
            setPage(0);
          }}
        />

        <FilterResetButton onClick={handleResetFilters} />
      </Box>

      {/* ─── KHỐI BẢNG DANH SÁCH HÓA ĐƠN (Đã bỏ thanh header bên trong) ─── */}
      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {(dateError || error) && (
          <Typography color="error" sx={{ p: 3, textAlign: 'center', fontSize: 14 }}>
            {dateError || error.message || 'Không thể tải danh sách hóa đơn.'}
          </Typography>
        )}

        {/* Bảng danh sách */}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="medium" sx={{ tableLayout: 'fixed', minWidth: 820 }}>
            <TableHead>
              <TableRow
                sx={{
                  '& th': {
                    borderBottom: `1px solid ${C.border}`,
                    py: 1.75,
                    bgcolor: C.bg,
                    color: C.body,
                    fontSize: PAGE_TYPE.th,
                    fontWeight: 600
                  }
                }}
              >
                <TableCell align="center" sx={{ width: 72 }}>
                  STT
                </TableCell>
                <TableCell>Mã hóa đơn</TableCell>
                <TableCell>Thời gian</TableCell>
                <TableCell>Người bán</TableCell>
                <TableCell>Tổng tiền</TableCell>
                <TableCell>Phương thức</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {isLoading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 8, textAlign: 'center' }}>
                    <CircularProgress size={32} sx={{ color: C.cyan }} />
                    <Typography sx={{ mt: 1.5, color: C.muted, fontSize: 13 }}>Đang tải danh sách hóa đơn...</Typography>
                  </TableCell>
                </TableRow>
              ) : !items.length && (dateError || error) ? null : !items.length ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 8, textAlign: 'center' }}>
                    <ShoppingCartOutlined style={{ fontSize: 36, color: C.faint }} />
                    <Typography sx={{ mt: 1, fontSize: 14, fontWeight: 700, color: C.text }}>Chưa có hóa đơn nào</Typography>
                    <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.5 }}>
                      Các hóa đơn bán hàng trực tiếp tại quầy sẽ xuất hiện ở đây.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((sale, i) => {
                  const { date, time } = splitDateTime(sale.orderDate);

                  return (
                    // Bấm vào dòng (hoặc Enter) là mở chi tiết hóa đơn, không cần nút xem riêng
                    <TableRow
                      key={sale.orderId}
                      hover
                      tabIndex={0}
                      role="link"
                      aria-label={`Xem chi tiết hóa đơn ${sale.invoiceNumber || sale.orderNumber}`}
                      onClick={() => navigate(`/in-store-sales/history/${sale.orderId}`)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/in-store-sales/history/${sale.orderId}`);
                      }}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': { bgcolor: '#FAFCFE' },
                        '&:focus-visible': { outline: `2px solid ${C.cyan}`, outlineOffset: '-2px' },
                        '& td': { borderBottom: `1px solid ${C.borderLight}`, py: 2 }
                      }}
                    >
                      <TableCell align="center" sx={{ fontSize: PAGE_TYPE.td, color: C.muted }}>
                        {page * PAGE_SIZE + i + 1}
                      </TableCell>

                      {/* Mã hóa đơn */}
                      <TableCell>
                        <Typography sx={{ fontWeight: 800, fontSize: PAGE_TYPE.td, color: C.text }}>
                          {sale.invoiceNumber || sale.orderNumber}
                        </Typography>
                      </TableCell>

                      {/* Thời gian */}
                      <TableCell>
                        <Typography sx={{ fontSize: PAGE_TYPE.td, fontWeight: 600, color: C.text }}>{date}</Typography>
                        <Typography sx={{ fontSize: PAGE_TYPE.tdSub, color: C.subtle }}>{time}</Typography>
                      </TableCell>

                      {/* Người bán */}
                      <TableCell>
                        <Typography sx={{ fontSize: PAGE_TYPE.td, color: C.text, fontWeight: 500 }}>{sale.sellerName || '—'}</Typography>
                      </TableCell>

                      {/* Tổng tiền */}
                      <TableCell>
                        <Typography sx={{ fontWeight: 800, fontSize: PAGE_TYPE.td, color: C.text }}>{money(sale.totalAmount)}</Typography>
                      </TableCell>

                      {/* Phương thức */}
                      <TableCell>
                        <PaymentBadge method={sale.paymentMethod} />
                      </TableCell>

                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Box>

        <Pager
          page={page}
          totalPages={totalPages}
          total={total}
          size={PAGE_SIZE}
          noun="hóa đơn"
          onPage={setPage}
          sx={{ borderTop: `1px solid ${C.borderLight}` }}
        />
      </Box>
    </Box>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import { Box, CircularProgress, IconButton, Table, TableBody, TableCell, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { CreditCardOutlined, DollarOutlined, EyeOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { FilterSelect, Pager, ResetFilterButton, SearchField, Toolbar } from 'features/account/components/Blocks';
import { ALL_TIME, DateRangeFilter, resolveDateRange } from 'features/account/components/DateFilter';
import { api } from '../../services/http';
import { useCrumbs } from '../../layouts/crumbs';
import { useDebounced } from '../account/hooks';

// Bảng màu tông trầm đồng bộ với màn khách hàng: đen (nhấn chính), đỏ đô (chữ nhấn), be (nền nhạt)
const C = {
  text: '#111111',
  muted: '#5C5650',
  border: '#E6E3DE',
  borderLight: '#EFEBE5',
  bg: '#F7F5F2',
  surface: '#FFFFFF',
  cyan: '#111111',
  cyanHover: '#2B2B2B',
  cyanText: '#8A2B2B',
  cream: '#F6F1E8',
  creamHover: '#EFE4CF',
  creamText: '#6B4E16'
};

const PAGE_SIZE = 8;

const PAYMENT_OPTIONS = [
  { value: '', label: 'Mọi phương thức' },
  { value: 'CASH', label: 'Tiền mặt' },
  { value: 'TRANSFER', label: 'Chuyển khoản' }
];

function isCashMethod(method) {
  if (!method) return true;
  const m = String(method).toUpperCase();
  return m === 'CASH' || m.includes('TIEN_MAT') || m.includes('TIỀN MẶT');
}

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

function formatReceiptDate(dateStr) {
  if (!dateStr) return { date: '—', time: '' };
  const d = new Date(dateStr);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`
  };
}

function buildQuery(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, value);
    }
  });
  const text = search.toString();
  return text ? `?${text}` : '';
}

export default function InStoreSalesHistoryPage() {
  useCrumbs(['Bán hàng tại quầy', 'Danh sách hóa đơn']);

  const navigate = useNavigate();

  const [q, setQ] = useState('');
  // Bộ lọc ngày dùng chung (DateFilter.jsx): tự chặn ngày tương lai và "Từ ngày" không vượt "Đến ngày"
  const [dateRange, setDateRange] = useState(ALL_TIME);
  const { from: fromDate, to: toDate } = resolveDateRange(dateRange);
  const [sellerId, setSellerId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [page, setPage] = useState(0);

  const debouncedSearch = useDebounced(q.trim(), 350);

  // Lấy danh sách thu ngân để phục vụ bộ lọc
  const { data: sellersData } = useSWR(
    '/sales/in-store/sellers',
    () => api('/sales/in-store/sellers'),
    { revalidateOnFocus: false }
  );
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

  const queryStr = buildQuery(params);
  const swrKey = `/sales/in-store${queryStr}`;

  const { data, error, isLoading } = useSWR(
    swrKey,
    (url) => api(url),
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const sellerOptions = [{ value: '', label: 'Tất cả thu ngân' }, ...sellers.map((s) => ({ value: String(s.id), label: s.name }))];

  function handleResetFilters() {
    setQ('');
    setDateRange(ALL_TIME);
    setSellerId('');
    setPaymentMethod('');
    setPage(0);
  }

  return (
    <Box sx={{ color: C.text, pb: 4 }}>
      {/* ─── TIÊU ĐỀ TRÊN CÙNG: DANH SÁCH HÓA ĐƠN ─── */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: C.text }}>
          Danh sách hóa đơn
        </Typography>
      </Box>

      {/* ─── THANH BỘ LỌC: dùng chung các ô lọc với những trang danh sách khác ─── */}
      <Toolbar>
        <Box sx={{ flex: '1 1 240px', minWidth: 240 }}>
          <SearchField title="Tìm kiếm hóa đơn" placeholder="Tìm theo mã hóa đơn..." value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Thu ngân" value={sellerId} onChange={filter(setSellerId)} options={sellerOptions} minWidth={170} />
        <FilterSelect label="Phương thức" value={paymentMethod} onChange={filter(setPaymentMethod)} options={PAYMENT_OPTIONS} minWidth={170} />
        <DateRangeFilter label="Ngày bán" value={dateRange} onChange={filter(setDateRange)} />
        <ResetFilterButton onClick={handleResetFilters} />
      </Toolbar>

      {/* ─── KHỐI BẢNG DANH SÁCH HÓA ĐƠN (Đã bỏ thanh header bên trong) ─── */}
      <Box
        sx={{
          bgcolor: C.surface,
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden'
        }}
      >
        {error && (
          <Typography color="error" sx={{ p: 3, textAlign: 'center', fontSize: 14 }}>
            {error.message || 'Không thể tải danh sách hóa đơn.'}
          </Typography>
        )}

        {/* Bảng danh sách */}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="medium">
            <TableHead>
              <TableRow sx={{ '& th': { borderBottom: `1px solid ${C.border}`, py: 1.75, bgcolor: C.bg } }}>
                <TableCell sx={{ color: C.muted, fontSize: 13, fontWeight: 600, pl: 3 }}>
                  Mã hóa đơn
                </TableCell>
                <TableCell sx={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>
                  Thời gian
                </TableCell>
                <TableCell sx={{ color: C.muted, fontSize: 13, fontWeight: 600 }}>
                  Thu ngân
                </TableCell>
                <TableCell sx={{ color: C.muted, fontSize: 13, fontWeight: 600 }} align="right">
                  Tổng tiền
                </TableCell>
                <TableCell sx={{ color: C.muted, fontSize: 13, fontWeight: 600, pl: 4 }}>
                  Phương thức
                </TableCell>
                <TableCell sx={{ color: C.muted, fontSize: 13, fontWeight: 600, pr: 3 }} align="center">
                  Thao tác
                </TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {isLoading && !items.length ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 8, textAlign: 'center' }}>
                    <CircularProgress size={32} sx={{ color: C.cyan }} />
                    <Typography sx={{ mt: 1.5, color: C.muted, fontSize: 13 }}>
                      Đang tải danh sách hóa đơn...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : !items.length ? (
                <TableRow>
                  <TableCell colSpan={6} sx={{ py: 8, textAlign: 'center' }}>
                    <ShoppingCartOutlined style={{ fontSize: 36, color: '#CBD5E1' }} />
                    <Typography sx={{ mt: 1, fontSize: 14, fontWeight: 700, color: C.text }}>
                      Chưa có hóa đơn nào
                    </Typography>
                    <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.5 }}>
                      Các hóa đơn bán hàng trực tiếp tại quầy sẽ xuất hiện ở đây.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((sale) => {
                  const isCash = isCashMethod(sale.paymentMethod);
                  const { date, time } = formatReceiptDate(sale.orderDate);

                  return (
                    <TableRow
                      key={sale.orderId}
                      hover
                      sx={{
                        '&:hover': { bgcolor: '#FAF8F5' },
                        '& td': { borderBottom: `1px solid ${C.borderLight}`, py: 2 }
                      }}
                    >
                      {/* Mã hóa đơn */}
                      <TableCell sx={{ pl: 3 }}>
                        <Typography sx={{ fontWeight: 800, fontSize: 13.5, color: C.text }}>
                          {sale.invoiceNumber || sale.orderNumber}
                        </Typography>
                      </TableCell>

                      {/* Thời gian */}
                      <TableCell>
                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                          {date}
                        </Typography>
                        <Typography sx={{ fontSize: 11.5, color: '#94A3B8' }}>
                          {time}
                        </Typography>
                      </TableCell>

                      {/* Thu ngân */}
                      <TableCell>
                        <Typography sx={{ fontSize: 13, color: C.text, fontWeight: 500 }}>
                          {sale.sellerName || '—'}
                        </Typography>
                      </TableCell>

                      {/* Tổng tiền */}
                      <TableCell align="right">
                        <Typography sx={{ fontWeight: 800, fontSize: 14, color: C.text }}>
                          {money(sale.totalAmount)}
                        </Typography>
                      </TableCell>

                      {/* Phương thức - Tiền mặt: nền be vàng; Chuyển khoản: nền be, chữ đỏ đô */}
                      <TableCell sx={{ pl: 4 }}>
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.75,
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 4,
                            bgcolor: isCash ? C.cream : C.borderLight,
                            color: isCash ? C.creamText : C.cyanText,
                            fontSize: 12,
                            fontWeight: 700,
                            letterSpacing: '0.01em'
                          }}
                        >
                          {isCash ? (
                            <DollarOutlined style={{ fontSize: 12 }} />
                          ) : (
                            <CreditCardOutlined style={{ fontSize: 12 }} />
                          )}
                          <span>{isCash ? 'Tiền mặt' : 'Chuyển khoản'}</span>
                        </Box>
                      </TableCell>

                      {/* Thao tác - Icon mắt đơn giản, không viền hộp, không button hover */}
                      <TableCell align="center" sx={{ pr: 3 }}>
                        <Tooltip title="Xem chi tiết hóa đơn">
                          <IconButton
                            size="small"
                            onClick={() => navigate(`/in-store-sales/history/${sale.orderId}`)}
                            sx={{
                              color: C.muted,
                              p: 0.75,
                              '&:hover': {
                                color: C.text,
                                bgcolor: 'transparent'
                              }
                            }}
                          >
                            <EyeOutlined style={{ fontSize: 17 }} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </Box>

        {/* ─── PHÂN TRANG PHÍA DƯỚI ─── */}
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

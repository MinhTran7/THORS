import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  CreditCardOutlined,
  DollarOutlined,
  EyeOutlined,
  LeftOutlined,
  ReloadOutlined,
  RightOutlined,
  SearchOutlined,
  ShoppingCartOutlined
} from '@ant-design/icons';
import { api } from '../../services/http';
import { useCrumbs } from '../../layouts/crumbs';
import { useDebounced } from '../account/hooks';

// Bảng màu chuẩn theo yêu cầu: chỉ dùng cyan #8EECF5 và cream #FFF7AE kết hợp nền/viền trung tính
const C = {
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cyanText: '#0E7490',
  cream: '#FFF7AE',
  creamHover: '#FFF294',
  creamText: '#713F12'
};

const PAGE_SIZE = 8;

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

  // Ngày hôm nay theo giờ địa phương (YYYY-MM-DD) để vô hiệu hóa hoàn toàn ngày trong tương lai
  const today = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const [q, setQ] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sellerId, setSellerId] = useState('');
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
    page,
    size: PAGE_SIZE
  };

  const { data, error, isLoading } = useSWR(
    ['/sales/in-store', params],
    () => api(`/sales/in-store${buildQuery(params)}`),
    { keepPreviousData: true, revalidateOnFocus: false }
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 0;

  function handleSearchChange(val) {
    setQ(val);
    setPage(0);
  }

  function handleFromDateChange(val) {
    // Chặn ngày tương lai
    if (val && val > today) val = today;
    setFromDate(val);
    setPage(0);
  }

  function handleToDateChange(val) {
    // Chặn ngày tương lai
    if (val && val > today) val = today;
    setToDate(val);
    setPage(0);
  }

  function handleResetFilters() {
    setQ('');
    setFromDate('');
    setToDate('');
    setSellerId('');
    setPage(0);
  }

  // Tạo mảng số trang hiển thị
  function renderPaginationPages() {
    const pages = [];
    if (totalPages <= 6) {
      for (let i = 0; i < totalPages; i++) pages.push(i);
    } else {
      pages.push(0);
      if (page > 2) pages.push('...');
      const start = Math.max(1, page - 1);
      const end = Math.min(totalPages - 2, page + 1);
      for (let i = start; i <= end; i++) {
        if (!pages.includes(i)) pages.push(i);
      }
      if (page < totalPages - 3) pages.push('...');
      pages.push(totalPages - 1);
    }
    return pages;
  }

  const startRecord = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const endRecord = Math.min((page + 1) * PAGE_SIZE, total);

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', color: C.text, pb: 4 }}>
      {/* ─── TIÊU ĐỀ TRÊN CÙNG: DANH SÁCH HÓA ĐƠN ─── */}
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: C.text }}>
          Danh sách hóa đơn
        </Typography>
        <Typography variant="body2" sx={{ color: C.muted, mt: 0.5 }}>
          Danh sách hóa đơn bán hàng trực tiếp tại quầy.
        </Typography>
      </Box>

      {/* ─── THANH BỘ LỌC PHÍA TRÊN ─── */}
      <Box
        sx={{
          mb: 3,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: '1fr 1fr',
            md: 'minmax(240px, 1.8fr) 180px 160px 160px auto'
          },
          gap: 2,
          alignItems: 'end'
        }}
      >
        {/* Tìm kiếm theo mã hóa đơn */}
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Tìm kiếm hóa đơn
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Tìm theo mã hóa đơn..."
            value={q}
            onChange={(e) => handleSearchChange(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                </InputAdornment>
              )
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: C.surface,
                borderRadius: 2.5,
                height: 44,
                '& fieldset': { borderColor: C.border },
                '&:hover fieldset': { borderColor: C.cyan },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          />
        </Box>

        {/* Lọc theo thu ngân */}
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Thu ngân
          </Typography>
          <TextField
            select
            fullWidth
            size="small"
            value={sellerId}
            onChange={(e) => {
              setSellerId(e.target.value);
              setPage(0);
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: C.surface,
                borderRadius: 2.5,
                height: 44,
                '& fieldset': { borderColor: C.border },
                '&:hover fieldset': { borderColor: C.cyan },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          >
            <MenuItem value="">Tất cả thu ngân</MenuItem>
            {sellers.map((s) => (
              <MenuItem key={s.id} value={s.id}>
                {s.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        {/* Từ ngày - Chặn tuyệt đối ngày tương lai */}
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Từ ngày
          </Typography>
          <TextField
            fullWidth
            size="small"
            type="date"
            value={fromDate}
            onChange={(e) => handleFromDateChange(e.target.value)}
            inputProps={{
              max: toDate && toDate < today ? toDate : today
            }}
            slotProps={{
              htmlInput: {
                max: toDate && toDate < today ? toDate : today
              }
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: C.surface,
                borderRadius: 2.5,
                height: 44,
                '& fieldset': { borderColor: C.border },
                '&:hover fieldset': { borderColor: C.cyan },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          />
        </Box>

        {/* Đến ngày - Chặn tuyệt đối ngày tương lai */}
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Đến ngày
          </Typography>
          <TextField
            fullWidth
            size="small"
            type="date"
            value={toDate}
            onChange={(e) => handleToDateChange(e.target.value)}
            inputProps={{
              min: fromDate || undefined,
              max: today
            }}
            slotProps={{
              htmlInput: {
                min: fromDate || undefined,
                max: today
              }
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: C.surface,
                borderRadius: 2.5,
                height: 44,
                '& fieldset': { borderColor: C.border },
                '&:hover fieldset': { borderColor: C.cyan },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          />
        </Box>

        {/* Nút Xóa lọc */}
        <Button
          variant="outlined"
          startIcon={<ReloadOutlined style={{ fontSize: 14 }} />}
          onClick={handleResetFilters}
          sx={{
            height: 44,
            px: 2.5,
            borderRadius: 2.5,
            textTransform: 'none',
            fontSize: 13.5,
            fontWeight: 600,
            borderColor: C.border,
            bgcolor: C.surface,
            color: C.text,
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            '&:hover': {
              bgcolor: C.cream,
              borderColor: C.creamHover,
              color: C.creamText
            }
          }}
        >
          Xóa lọc
        </Button>
      </Box>

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
              <TableRow sx={{ '& th': { borderBottom: `1px solid ${C.border}`, py: 1.75, bgcolor: '#F8FAFC' } }}>
                <TableCell sx={{ color: '#475569', fontSize: 13, fontWeight: 600, pl: 3 }}>
                  Mã hóa đơn
                </TableCell>
                <TableCell sx={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>
                  Thời gian
                </TableCell>
                <TableCell sx={{ color: '#475569', fontSize: 13, fontWeight: 600 }}>
                  Thu ngân
                </TableCell>
                <TableCell sx={{ color: '#475569', fontSize: 13, fontWeight: 600 }} align="right">
                  Tổng tiền
                </TableCell>
                <TableCell sx={{ color: '#475569', fontSize: 13, fontWeight: 600, pl: 4 }}>
                  Phương thức
                </TableCell>
                <TableCell sx={{ color: '#475569', fontSize: 13, fontWeight: 600, pr: 3 }} align="center">
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
                  const isCash = sale.paymentMethod === 'CASH';
                  const { date, time } = formatReceiptDate(sale.orderDate);

                  return (
                    <TableRow
                      key={sale.orderId}
                      hover
                      sx={{
                        '&:hover': { bgcolor: '#FAFCFE' },
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

                      {/* Phương thức - Dùng chuẩn màu cyan #8EECF5 và cream #FFF7AE */}
                      <TableCell sx={{ pl: 4 }}>
                        <Box
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.75,
                            px: 1.5,
                            py: 0.5,
                            borderRadius: 4,
                            bgcolor: isCash ? C.cream : C.cyan,
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
                              color: '#64748B',
                              p: 0.75,
                              '&:hover': {
                                color: '#0F172A',
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
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems="center"
          spacing={2}
          sx={{ px: 3, py: 2.5, borderTop: `1px solid ${C.borderLight}` }}
        >
          <Typography sx={{ fontSize: 13, color: C.muted }}>
            Hiển thị {startRecord}–{endRecord} trong {total} hóa đơn
          </Typography>

          <Stack direction="row" spacing={1} alignItems="center">
            {/* Nút lùi trang */}
            <IconButton
              size="small"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                border: `1px solid ${C.border}`,
                color: C.text,
                '&.Mui-disabled': { borderColor: C.borderLight, color: '#CBD5E1' }
              }}
            >
              <LeftOutlined style={{ fontSize: 11 }} />
            </IconButton>

            {/* Các số trang */}
            {renderPaginationPages().map((p, idx) => {
              if (p === '...') {
                return (
                  <Typography key={`dots-${idx}`} sx={{ px: 0.5, color: C.muted, fontSize: 13 }}>
                    ...
                  </Typography>
                );
              }
              const isActive = p === page;
              return (
                <Button
                  key={p}
                  onClick={() => setPage(p)}
                  sx={{
                    minWidth: 32,
                    height: 32,
                    p: 0,
                    borderRadius: 2,
                    fontSize: 13,
                    fontWeight: isActive ? 800 : 500,
                    bgcolor: isActive ? C.cyan : 'transparent',
                    color: isActive ? C.text : C.muted,
                    border: isActive ? `1px solid ${C.cyanHover}` : 'none',
                    '&:hover': {
                      bgcolor: isActive ? C.cyanHover : '#F1F5F9'
                    }
                  }}
                >
                  {p + 1}
                </Button>
              );
            })}

            {/* Nút tiến trang */}
            <IconButton
              size="small"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              sx={{
                width: 32,
                height: 32,
                borderRadius: 2,
                border: `1px solid ${C.border}`,
                color: C.text,
                '&.Mui-disabled': { borderColor: C.borderLight, color: '#CBD5E1' }
              }}
            >
              <RightOutlined style={{ fontSize: 11 }} />
            </IconButton>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}

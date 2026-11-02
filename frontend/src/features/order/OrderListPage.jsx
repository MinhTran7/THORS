import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import useSWR from 'swr';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography
} from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import {
  ClockCircleOutlined,
  EyeOutlined,
  FileTextOutlined,
  InboxOutlined,
  PhoneOutlined,
  PlusOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TagOutlined
} from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { useAuth } from 'features/auth/AuthProvider';
import { PAGE_SIZE } from 'features/account/constants';
import { useDebounced } from 'features/account/hooks';
import { formatTime } from 'features/account/format';
import { brand, cardSx } from 'features/account/tokens';
import { BrandButton, OutlineButton } from 'features/account/components/Brand';
import { StatusPill } from 'features/account/components/Chips';
import { bodyCellSx, EmptyRow, headCellSx, PageHeader, Pager, SearchField, Toolbar } from 'features/account/components/Blocks';
import { ordersApi } from './api';
import { CARRIERS, CUSTOMER_ACTIONS, OWNER_ACTIONS } from './orderActions';
import { formatVnd, orderStatusMeta, paymentMethodLabel, paymentStatusMeta, preparationMeta } from './constants';

// Các tab của khách (kiểu "Đơn mua"): mỗi tab là một hoặc nhiều trạng thái
const CUSTOMER_TABS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'AWAITING_PAYMENT', label: 'Chờ thanh toán' },
  { value: 'PENDING_CONFIRMATION', label: 'Chờ xác nhận' },
  { value: 'AWAITING_PICKUP', label: 'Chờ lấy hàng' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'DELIVERED', label: 'Đã giao' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED,REJECTED,EXPIRED', label: 'Đã hủy' }
];

// Bộ lọc ngày đặt hàng
const DATE_PRESETS = [
  { value: 'all', label: 'Tất cả thời gian' },
  { value: 'today', label: 'Hôm nay' },
  { value: '7', label: '7 ngày gần nhất' },
  { value: '30', label: '30 ngày gần nhất' },
  { value: 'month', label: 'Tháng này' },
  { value: 'custom', label: 'Chọn khoảng ngày' }
];

// Bộ lọc hình thức thanh toán (khớp với backend: COD hoặc ONLINE = mọi hình thức không phải COD)
const PAYMENT_FILTERS = [
  { value: 'all', label: 'Mọi hình thức thanh toán' },
  { value: 'COD', label: 'Thanh toán khi nhận hàng (COD)' },
  { value: 'ONLINE', label: 'Thanh toán online' }
];

// Lý do có sẵn để chọn; chỉ khi chọn "Lý do khác" mới phải tự nhập
const OTHER_REASON = '__OTHER__';
const OWNER_REJECT_REASONS = [
  'Hết hàng',
  'Sản phẩm không còn kinh doanh',
  'Không liên hệ được với khách hàng',
  'Địa chỉ giao hàng không hỗ trợ',
  'Thông tin đơn hàng không hợp lệ'
];
const OWNER_CANCEL_REASONS = [
  'Hết hàng / sản phẩm lỗi',
  'Không liên hệ được với khách hàng',
  'Khách yêu cầu hủy đơn',
  'Khách chưa thanh toán',
  'Sai giá hoặc sai thông tin sản phẩm'
];
const CUSTOMER_CANCEL_REASONS = [
  'Muốn thay đổi địa chỉ giao hàng',
  'Muốn thay đổi sản phẩm (kích cỡ, màu sắc, số lượng...)',
  'Đặt nhầm sản phẩm',
  'Tìm được giá tốt hơn ở nơi khác',
  'Thủ tục thanh toán quá rắc rối',
  'Không có nhu cầu mua nữa'
];

// Tổng số đơn của một tab (tab "Đã hủy" gồm nhiều trạng thái)
const statusCount = (counts, value) =>
  value === 'all' ? Object.values(counts).reduce((sum, n) => sum + n, 0) : value.split(',').reduce((sum, st) => sum + (counts[st] ?? 0), 0);

const pad = (n) => String(n).padStart(2, '0');

// Hiển thị ngày dạng dd/mm/yyyy
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

// Dạng yyyy-MM-dd (giờ địa phương) để gửi lên backend / gán cho input type="date"
const toIsoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Đổi lựa chọn bộ lọc ngày thành khoảng from/to
const getDateRange = (preset, customFrom, customTo) => {
  const today = new Date();
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  switch (preset) {
    case 'today':
      return { dateFrom: toIsoDate(today), dateTo: toIsoDate(today) };
    case '7':
      return { dateFrom: toIsoDate(daysAgo(6)), dateTo: toIsoDate(today) };
    case '30':
      return { dateFrom: toIsoDate(daysAgo(29)), dateTo: toIsoDate(today) };
    case 'month':
      return { dateFrom: toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1)), dateTo: toIsoDate(today) };
    case 'custom':
      return { dateFrom: customFrom || undefined, dateTo: customTo || undefined };
    default:
      return {};
  }
};

// Mã đơn: màu đỏ, gạch chân
const orderNumberSx = { color: '#DC2626', textDecoration: 'underline', textUnderlineOffset: '3px', fontWeight: 700 };

function TabLabel({ label, count, alert }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <span>{label}</span>
      {count > 0 && (
        <Box
          component="span"
          sx={{
            minWidth: 20,
            height: 20,
            px: 0.75,
            borderRadius: '10px',
            fontSize: 12,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: alert ? '#fff' : brand.ink,
            bgcolor: alert ? '#EF4444' : brand.neutralBg,
            boxShadow: alert ? '0 2px 6px rgba(239, 68, 68, 0.35)' : 'none'
          }}
        >
          {count}
        </Box>
      )}
    </Box>
  );
}

function CustomerOrderCard({ order, onOpen, actions, onAction, busy }) {
  const meta = orderStatusMeta(order.orderStatus);
  const pay = paymentStatusMeta(order.paymentStatus);
  const lines = order.lines ?? [];

  return (
    <Box
      sx={{
        ...cardSx,
        mb: 2,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 4px 14px rgba(0, 0, 0, 0.07)',
          borderColor: '#D4D6CC'
        }
      }}
    >
      {/* Đầu thẻ: cửa hàng và trạng thái */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 2,
          px: 2.5,
          py: 1.5,
          bgcolor: '#FAFAF7',
          borderBottom: `1px solid ${brand.line}`
        }}
      >
        <Stack direction="row" spacing={1} alignItems="center">
          <Box
            sx={{
              width: 28,
              height: 28,
              borderRadius: '6px',
              bgcolor: brand.cyanSoft,
              color: brand.inkOnCyan,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 14
            }}
          >
            <ShopOutlined />
          </Box>
          <Typography variant="body2" sx={{ fontWeight: 700, color: brand.ink }}>
            THORS Studio
          </Typography>
        </Stack>

        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap' }}>
          <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ...orderNumberSx, fontSize: 13, fontFamily: 'monospace' }}>
            <FileTextOutlined style={{ fontSize: 12 }} />
            <span>#{order.orderNumber}</span>
          </Stack>
          <Divider orientation="vertical" flexItem sx={{ height: 14, my: 'auto', borderColor: brand.line }} />
          <StatusPill tone={meta.tone} label={meta.label.toUpperCase()} />
        </Stack>
      </Box>

      {/* Các sản phẩm trong đơn: bấm vào để xem chi tiết */}
      <Box onClick={onOpen} sx={{ cursor: 'pointer' }}>
        {lines.map((line, index) => (
          <Box
            key={`${order.id}-${index}`}
            sx={{
              display: 'flex',
              gap: 2,
              px: 2.5,
              py: 2,
              borderBottom: index < lines.length - 1 ? `1px solid ${brand.line}` : 'none',
              transition: 'background-color 0.15s ease',
              '&:hover': { bgcolor: '#FDFDFB' }
            }}
          >
            {line.imageUrl ? (
              <Box
                component="img"
                src={line.imageUrl}
                alt={line.productName}
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '8px',
                  objectFit: 'cover',
                  bgcolor: brand.neutralBg,
                  border: `1px solid ${brand.line}`,
                  flexShrink: 0
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 80,
                  height: 80,
                  borderRadius: '8px',
                  bgcolor: '#F3F4EE',
                  border: `1px solid ${brand.line}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: brand.muted,
                  fontSize: 24,
                  flexShrink: 0
                }}
              >
                <ShoppingOutlined />
              </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body1"
                sx={{
                  fontWeight: 600,
                  fontSize: 15,
                  color: brand.ink,
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  lineHeight: 1.35
                }}
              >
                {line.productName}
              </Typography>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75, flexWrap: 'wrap' }}>
                {[line.size, line.color].filter(Boolean).length > 0 && (
                  <Box
                    component="span"
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      bgcolor: brand.neutralBg,
                      color: brand.muted,
                      px: 0.8,
                      py: 0.2,
                      borderRadius: '6px',
                      fontSize: 12
                    }}
                  >
                    <TagOutlined style={{ fontSize: 10 }} />
                    {[line.size, line.color].filter(Boolean).join(', ')}
                  </Box>
                )}
                <Typography variant="body2" sx={{ color: brand.muted, fontSize: 13 }}>
                  Số lượng: <strong>x{line.quantity}</strong>
                </Typography>
              </Stack>
            </Box>
            <Box sx={{ textAlign: 'right', alignSelf: 'center', pl: 1 }}>
              <Typography variant="body1" sx={{ color: brand.ink, fontWeight: 600, whiteSpace: 'nowrap', fontSize: 15 }}>
                {formatVnd(line.unitPrice)}
              </Typography>
            </Box>
          </Box>
        ))}
        {lines.length === 0 && (
          <Box sx={{ px: 2.5, py: 2.5, display: 'flex', alignItems: 'center', gap: 1.5, color: brand.muted }}>
            <ShoppingOutlined style={{ fontSize: 20 }} />
            <Typography variant="body2">
              {order.firstItemName || '—'} · {order.itemCount} sản phẩm
            </Typography>
          </Box>
        )}
      </Box>

      {/* Chân thẻ: thành tiền và nút thao tác */}
      <Box sx={{ px: 2.5, py: 2, bgcolor: '#FAFAF7', borderTop: `1px solid ${brand.line}` }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 1.75 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ color: brand.muted, fontSize: 13, flexWrap: 'wrap' }}>
            <Stack direction="row" spacing={0.5} alignItems="center">
              <ClockCircleOutlined style={{ fontSize: 12 }} />
              <span>
                {formatDate(order.orderDate)} · {formatTime(order.orderDate)}
              </span>
            </Stack>
            <span>·</span>
            <span>{paymentMethodLabel(order.paymentMethod)}</span>
            <StatusPill tone={pay.tone} label={pay.label} />
          </Stack>

          <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
            <Typography variant="body2" sx={{ color: brand.muted, fontSize: 14 }}>
              Thành tiền:
            </Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 700, color: brand.ink }}>{formatVnd(order.totalAmount)}</Typography>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
          <OutlineButton
            size="small"
            component={RouterLink}
            to={`/orders/${order.id}`}
            startIcon={<EyeOutlined />}
            sx={{ fontSize: 13, py: 0.6, px: 1.75 }}
          >
            Xem chi tiết
          </OutlineButton>
          {actions.map((action) =>
            action.primary ? (
              <BrandButton
                key={action.to}
                size="small"
                disableElevation
                disabled={busy}
                onClick={() => onAction(action)}
                sx={{ fontSize: 13, py: 0.6, px: 2 }}
              >
                {action.label}
              </BrandButton>
            ) : (
              <OutlineButton
                key={action.to}
                size="small"
                disabled={busy}
                onClick={() => onAction(action)}
                sx={{
                  fontSize: 13,
                  py: 0.6,
                  px: 1.75,
                  color: action.askReason ? brand.dangerInk : brand.ink,
                  borderColor: action.askReason ? '#FCA5A5' : brand.line,
                  '&:hover': { bgcolor: action.askReason ? brand.dangerBg : undefined }
                }}
              >
                {action.label}
              </OutlineButton>
            )
          )}
        </Box>
      </Box>
    </Box>
  );
}

export default function OrderListPage() {
  useCrumbs(['Đơn hàng']);
  const { account } = useAuth();
  const navigate = useNavigate();
  const isCustomer = account.role === 'CUSTOMER';

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState('');
  const [dialog, setDialog] = useState(null); // { order, action } đang chờ chọn lý do hoặc chọn hình thức giao
  const [reasonChoice, setReasonChoice] = useState(''); // lý do có sẵn đã chọn (hoặc OTHER_REASON)
  const [customReason, setCustomReason] = useState(''); // chỉ dùng khi chọn "Lý do khác"
  const [carrier, setCarrier] = useState('SELF');
  const isOwner = account.role === 'OWNER';
  const search = useDebounced(q.trim());

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const { dateFrom, dateTo } = getDateRange(datePreset, customFrom, customTo);
  const params = {
    status: status === 'all' ? undefined : status,
    q: search || undefined,
    dateFrom,
    dateTo,
    paymentMethod: paymentFilter === 'all' ? undefined : paymentFilter,
    page,
    size: PAGE_SIZE
  };
  const list = useSWR(['orders', params], () => ordersApi.list(params), { keepPreviousData: true, revalidateOnFocus: false });
  // Số đơn theo trạng thái cho các tab của chủ shop
  const counts = useSWR(isOwner ? ['order-counts'] : null, () => ordersApi.counts(), { revalidateOnFocus: false });
  const countData = counts.data ?? {};
  const refresh = () => Promise.all([list.mutate(), isOwner ? counts.mutate() : null]);

  const hasFilter = Boolean(search) || status !== 'all' || datePreset !== 'all' || paymentFilter !== 'all';

  // Chỉ dành cho chủ shop, để test thông báo: tạo đơn online mẫu rồi tải lại danh sách
  const createSample = async () => {
    setCreating(true);
    setCreateError('');
    try {
      await ordersApi.createSample();
      setPage(0);
      await refresh();
    } catch (e) {
      setCreateError(e.message || 'Không tạo được đơn mẫu.');
    } finally {
      setCreating(false);
    }
  };

  // Chủ shop xử lý đơn ngay trên danh sách, không cần vào trang chi tiết
  const runAction = async (order, action, why, carrierValue) => {
    setBusyId(order.id);
    setRowError('');
    try {
      await ordersApi.changeStatus(order.id, action.to, why, carrierValue);
      setDialog(null);
      await refresh();
    } catch (e) {
      setRowError(e.message || 'Không đổi được trạng thái đơn.');
    } finally {
      setBusyId(null);
    }
  };

  const startAction = (order, action) => {
    setRowError('');
    if (action.askReason || action.askCarrier) {
      setReasonChoice('');
      setCustomReason('');
      setCarrier('SELF');
      setDialog({ order, action });
    } else {
      runAction(order, action);
    }
  };

  // Danh sách lý do có sẵn tùy theo người thao tác và loại thao tác (từ chối / hủy)
  const getReasons = (action) => {
    if (isCustomer) return CUSTOMER_CANCEL_REASONS;
    return action?.to === 'REJECTED' ? OWNER_REJECT_REASONS : OWNER_CANCEL_REASONS;
  };

  const finalReason = reasonChoice === OTHER_REASON ? customReason.trim() : reasonChoice;
  const canConfirm = dialog?.action.askCarrier ? true : Boolean(finalReason);

  const items = list.data?.items ?? [];

  // Hộp thoại chọn lý do (từ chối, hủy) hoặc chọn hình thức giao; dùng chung cho khách và chủ shop
  const actionDialog = (
    <Dialog
      open={Boolean(dialog)}
      onClose={() => busyId === null && setDialog(null)}
      fullWidth
      maxWidth="xs"
      slotProps={{ paper: { sx: { borderRadius: '16px', p: 1 } } }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 700, fontSize: 18, color: brand.ink }}>{dialog?.action.label}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {dialog && (
          <Box sx={{ p: 1.5, bgcolor: '#FAFAF7', border: `1px solid ${brand.line}`, borderRadius: '10px', mb: 2 }}>
            <Typography variant="body2" sx={{ color: brand.ink, fontWeight: 700 }}>
              Đơn hàng <span style={{ color: '#DC2626', textDecoration: 'underline', textUnderlineOffset: '3px' }}>#{dialog.order.orderNumber}</span>
            </Typography>
            <Typography variant="body2" sx={{ color: brand.muted, mt: 0.25 }}>
              Người nhận: <strong>{dialog.order.deliveryName}</strong>
            </Typography>
            {dialog.action.askCarrier && (
              <Typography variant="body2" sx={{ color: brand.muted, mt: 0.5 }}>
                Địa chỉ giao:{' '}
                <Typography component="span" variant="body2" sx={{ color: brand.ink, fontWeight: 600 }}>
                  {dialog.order.deliveryAddress || '—'}
                </Typography>
              </Typography>
            )}
          </Box>
        )}
        {dialog?.action.askCarrier ? (
          <TextField
            select
            autoFocus
            fullWidth
            margin="dense"
            label="Hình thức giao hàng"
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            helperText={
              carrier === 'SELF'
                ? 'Cửa hàng tự giao hàng (địa chỉ gần, không cần mã vận đơn).'
                : 'Giao hàng thông qua đơn vị vận chuyển đối tác.'
            }
            slotProps={{ select: { sx: { borderRadius: '10px' } } }}
          >
            {CARRIERS.map((item) => (
              <MenuItem key={item.value} value={item.value}>
                {item.label}
              </MenuItem>
            ))}
          </TextField>
        ) : (
          dialog && (
            <Box>
              <Typography variant="body2" sx={{ color: brand.ink, fontWeight: 600, mb: 0.5 }}>
                Chọn lý do
              </Typography>
              <RadioGroup
                value={reasonChoice}
                onChange={(e) => setReasonChoice(e.target.value)}
              >
                {[...getReasons(dialog.action), OTHER_REASON].map((item) => (
                  <FormControlLabel
                    key={item}
                    value={item}
                    control={<Radio size="small" />}
                    label={<Typography variant="body2">{item === OTHER_REASON ? 'Lý do khác' : item}</Typography>}
                    sx={{ mr: 0 }}
                  />
                ))}
              </RadioGroup>
              {reasonChoice === OTHER_REASON && (
                <TextField
                  autoFocus
                  fullWidth
                  multiline
                  minRows={3}
                  margin="dense"
                  label="Nhập lý do"
                  placeholder="Nhập lý do cụ thể..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  inputProps={{ maxLength: 255 }}
                  slotProps={{ input: { sx: { borderRadius: '10px' } } }}
                />
              )}
            </Box>
          )
        )}
        {rowError && (
          <Alert severity="error" sx={{ mt: 1.5, borderRadius: '8px' }}>
            {rowError}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
        <OutlineButton disabled={busyId !== null} onClick={() => setDialog(null)} sx={{ px: 2 }}>
          Quay lại
        </OutlineButton>
        {dialog?.action.askCarrier ? (
          <BrandButton disabled={busyId !== null} onClick={() => runAction(dialog.order, dialog.action, '', carrier)} sx={{ px: 2.5 }}>
            {busyId !== null ? 'Đang xử lý...' : 'Xác nhận'}
          </BrandButton>
        ) : (
          <Button
            variant="contained"
            color="error"
            disableElevation
            disabled={busyId !== null || !canConfirm}
            onClick={() => runAction(dialog.order, dialog.action, finalReason, carrier)}
            sx={{ borderRadius: '10px', textTransform: 'none', fontWeight: 600, px: 2.5 }}
          >
            {busyId !== null ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );

  // Thanh bộ lọc: tìm kiếm, ngày đặt, hình thức thanh toán; dùng chung cho khách và chủ shop
  const filterBar = (searchPlaceholder) => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
      <Box sx={{ flex: 1, minWidth: 260 }}>
        <SearchField placeholder={searchPlaceholder} value={q} onChange={filter(setQ)} />
      </Box>
      <TextField
        select
        size="small"
        label="Ngày đặt"
        value={datePreset}
        onChange={(e) => filter(setDatePreset)(e.target.value)}
        sx={{ minWidth: 190 }}
        slotProps={{ select: { sx: { borderRadius: '10px' } } }}
      >
        {DATE_PRESETS.map((item) => (
          <MenuItem key={item.value} value={item.value}>
            {item.label}
          </MenuItem>
        ))}
      </TextField>
      {datePreset === 'custom' && (
        <>
          <TextField
            type="date"
            size="small"
            label="Từ ngày"
            value={customFrom}
            onChange={(e) => filter(setCustomFrom)(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: customTo || undefined }, input: { sx: { borderRadius: '10px' } } }}
          />
          <TextField
            type="date"
            size="small"
            label="Đến ngày"
            value={customTo}
            onChange={(e) => filter(setCustomTo)(e.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: customFrom || undefined }, input: { sx: { borderRadius: '10px' } } }}
          />
        </>
      )}
      <TextField
        select
        size="small"
        label="Thanh toán"
        value={paymentFilter}
        onChange={(e) => filter(setPaymentFilter)(e.target.value)}
        sx={{ minWidth: 230 }}
        slotProps={{ select: { sx: { borderRadius: '10px' } } }}
      >
        {PAYMENT_FILTERS.map((item) => (
          <MenuItem key={item.value} value={item.value}>
            {item.label}
          </MenuItem>
        ))}
      </TextField>
    </Box>
  );

  // ---------------------------------------------------------------- Khách hàng (kiểu Shopee)
  if (isCustomer) {
    return (
      <Box>
        <PageHeader title="Đơn hàng của tôi" subtitle="Theo dõi các đơn bạn đã đặt trên website." />

        <Box sx={{ ...cardSx, p: 0.5, mb: 2, bgcolor: brand.surface, borderRadius: '12px' }}>
          <Tabs
            value={status}
            onChange={(_, value) => filter(setStatus)(value)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: 44,
              '& .MuiTabs-indicator': {
                bgcolor: brand.cyan,
                height: 3,
                borderRadius: '3px 3px 0 0'
              },
              '& .MuiTab-root': {
                minHeight: 44,
                py: 1.25,
                px: { xs: 1.5, sm: 2.25 },
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 14,
                color: brand.muted,
                transition: 'color 0.2s ease',
                '&.Mui-selected': {
                  color: brand.ink,
                  fontWeight: 700
                },
                '&:hover': {
                  color: brand.ink
                }
              }
            }}
          >
            {CUSTOMER_TABS.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={tab.label} sx={{ minWidth: { xs: 100, sm: 120 } }} />
            ))}
          </Tabs>
        </Box>

        <Box sx={{ mb: 2 }}>{filterBar('Tìm theo mã đơn hoặc tên sản phẩm...')}</Box>

        {rowError && !dialog && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>
            {rowError}
          </Alert>
        )}
        {list.error && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>
            {list.error.message}
          </Alert>
        )}

        {items.map((order) => (
          <CustomerOrderCard
            key={order.id}
            order={order}
            busy={busyId === order.id}
            onOpen={() => navigate(`/orders/${order.id}`)}
            actions={CUSTOMER_ACTIONS[order.orderStatus] ?? []}
            onAction={(action) => startAction(order, action)}
          />
        ))}

        {!list.isLoading && items.length === 0 && (
          <Box sx={{ ...cardSx, py: 9, textAlign: 'center', bgcolor: brand.surface, borderRadius: '14px' }}>
            <Box
              sx={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                bgcolor: '#F3F4EE',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#9CA3AF',
                fontSize: 32,
                mb: 2
              }}
            >
              <InboxOutlined />
            </Box>
            <Typography variant="h5" sx={{ color: brand.ink, fontWeight: 700, fontSize: 17 }}>
              {hasFilter ? 'Không tìm thấy đơn hàng nào' : 'Chưa có đơn hàng nào'}
            </Typography>
            <Typography variant="body2" sx={{ color: brand.muted, mt: 0.75, maxWidth: 360, mx: 'auto', fontSize: 14 }}>
              {hasFilter
                ? 'Thử thay đổi từ khóa, bộ lọc hoặc chọn tab trạng thái khác.'
                : 'Các đơn hàng bạn đặt trên hệ thống sẽ xuất hiện tại đây.'}
            </Typography>
          </Box>
        )}

        {items.length > 0 && (
          <Box sx={{ ...cardSx, overflow: 'hidden', mt: 2 }}>
            <Pager
              page={page}
              totalPages={list.data?.totalPages ?? 0}
              total={list.data?.total ?? 0}
              size={PAGE_SIZE}
              noun="đơn hàng"
              onPage={setPage}
            />
          </Box>
        )}
        {actionDialog}
      </Box>
    );
  }

  // ---------------------------------------------------------------- Chủ shop / người xử lý đơn (bảng)
  const columns = ['Đơn hàng', 'Người nhận', 'Sản phẩm', 'Tổng tiền', 'Thanh toán', 'Trạng thái', 'Thao tác'];

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, flexWrap: 'wrap', mb: 1 }}>
        <Box sx={{ flex: 1, minWidth: 260 }}>
          <PageHeader title="Đơn hàng online" subtitle="Xem và xử lý các đơn khách đặt trên website." />
        </Box>
        {isOwner && (
          <OutlineButton onClick={createSample} disabled={creating} startIcon={<PlusOutlined />} sx={{ mt: 1, fontSize: 13, py: 0.8 }}>
            {creating ? 'Đang tạo...' : 'Tạo đơn mẫu (Test)'}
          </OutlineButton>
        )}
      </Box>

      {createError && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>
          {createError}
        </Alert>
      )}
      {rowError && !dialog && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>
          {rowError}
        </Alert>
      )}

      <Box sx={{ ...cardSx, p: 0.5, mb: 2, bgcolor: brand.surface, borderRadius: '12px' }}>
        <Tabs
          value={status}
          onChange={(_, value) => filter(setStatus)(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            minHeight: 44,
            '& .MuiTabs-indicator': {
              bgcolor: brand.cyan,
              height: 3,
              borderRadius: '3px 3px 0 0'
            },
            '& .MuiTab-root': {
              minHeight: 44,
              py: 1.25,
              px: { xs: 1.5, sm: 2.25 },
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 14,
              color: brand.muted,
              transition: 'color 0.2s ease',
              '&.Mui-selected': {
                color: brand.ink,
                fontWeight: 700
              },
              '&:hover': {
                color: brand.ink
              }
            }
          }}
        >
          {CUSTOMER_TABS.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={<TabLabel label={tab.label} count={statusCount(countData, tab.value)} alert={tab.value === 'PENDING_CONFIRMATION'} />}
              sx={{ minWidth: { xs: 100, sm: 120 } }}
            />
          ))}
        </Tabs>
      </Box>

      <Toolbar>
        <Box sx={{ flex: 1 }}>{filterBar('Tìm theo mã đơn, người nhận hoặc số điện thoại...')}</Box>
      </Toolbar>

      <Box sx={{ ...cardSx, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)', borderRadius: '14px' }}>
        {list.error && (
          <Alert severity="error" sx={{ m: 2, borderRadius: '10px' }}>
            {list.error.message}
          </Alert>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1020 }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#FBFBF8' }}>
                {columns.map((label, index) => (
                  <TableCell
                    key={`${label}-${index}`}
                    sx={{
                      ...headCellSx,
                      fontWeight: 700,
                      fontSize: 12.5,
                      color: brand.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      py: 1.75,
                      ...(label === 'Thao tác' ? { width: 340 } : {})
                    }}
                  >
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((order) => {
                const statusMeta = orderStatusMeta(order.orderStatus);
                const payMeta = paymentStatusMeta(order.paymentStatus);
                const prep =
                  order.preparationStatus && order.preparationStatus !== 'NOT_STARTED' ? preparationMeta(order.preparationStatus) : null;
                return (
                  <TableRow
                    key={order.id}
                    hover
                    sx={{
                      transition: 'background-color 0.15s ease',
                      '&:hover': { bgcolor: '#F9FAF5' }
                    }}
                  >
                    {/* Cột 1: Mã đơn & Ngày giờ */}
                    <TableCell sx={{ ...bodyCellSx, py: 1.75 }}>
                      <Typography variant="body2" sx={{ ...orderNumberSx, fontFamily: 'monospace', fontSize: 13.5 }}>
                        {order.orderNumber}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: brand.muted, fontSize: 12, mt: 0.35 }}>
                        <ClockCircleOutlined style={{ fontSize: 11 }} />
                        <span>
                          {formatDate(order.orderDate)} · {formatTime(order.orderDate)}
                        </span>
                      </Stack>
                    </TableCell>

                    {/* Cột 2: Người nhận */}
                    <TableCell sx={{ ...bodyCellSx, py: 1.75 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
                        {order.deliveryName || '—'}
                      </Typography>
                      <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: brand.muted, fontSize: 12, mt: 0.35 }}>
                        <PhoneOutlined style={{ fontSize: 11 }} />
                        <span>{order.deliveryPhone || '—'}</span>
                      </Stack>
                    </TableCell>

                    {/* Cột 3: Sản phẩm */}
                    <TableCell sx={{ ...bodyCellSx, py: 1.75, maxWidth: 240 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 500, color: brand.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={order.firstItemName}
                      >
                        {order.firstItemName || '—'}
                      </Typography>
                      <Box
                        component="span"
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          bgcolor: '#F3F4EE',
                          color: brand.muted,
                          px: 0.8,
                          py: 0.2,
                          borderRadius: '6px',
                          fontSize: 11.5,
                          fontWeight: 600,
                          mt: 0.35
                        }}
                      >
                        <ShoppingOutlined style={{ fontSize: 10 }} />
                        {order.itemCount} sản phẩm
                      </Box>
                    </TableCell>

                    {/* Cột 4: Tổng tiền */}
                    <TableCell sx={{ ...bodyCellSx, py: 1.75, whiteSpace: 'nowrap', fontWeight: 700, fontSize: 15, color: brand.ink }}>
                      {formatVnd(order.totalAmount)}
                    </TableCell>

                    {/* Cột 5: Thanh toán */}
                    <TableCell sx={{ ...bodyCellSx, py: 1.75 }}>
                      <Stack spacing={0.5} alignItems="flex-start">
                        <StatusPill tone={payMeta.tone} label={payMeta.label} />
                        <Typography variant="caption" sx={{ color: brand.muted, fontSize: 11.5 }}>
                          {paymentMethodLabel(order.paymentMethod)}
                        </Typography>
                      </Stack>
                    </TableCell>

                    {/* Cột 6: Trạng thái đơn */}
                    <TableCell sx={{ ...bodyCellSx, py: 1.75 }}>
                      <Stack spacing={0.5} alignItems="flex-start">
                        <StatusPill tone={statusMeta.tone} label={statusMeta.label} />
                        {prep && (
                          <Box
                            sx={{
                              bgcolor: brand.yellowSoft,
                              color: brand.yellowInk,
                              px: 0.8,
                              py: 0.2,
                              borderRadius: '6px',
                              fontSize: 11.5,
                              fontWeight: 600
                            }}
                          >
                            {prep.label}
                          </Box>
                        )}
                      </Stack>
                    </TableCell>

                    {/* Cột 7: Thao tác */}
                    <TableCell sx={{ ...bodyCellSx, py: 1.75 }}>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                        <OutlineButton
                          size="small"
                          component={RouterLink}
                          to={`/orders/${order.id}`}
                          startIcon={<EyeOutlined />}
                          sx={{ fontSize: 12.5, py: 0.4, px: 1.25 }}
                        >
                          Xem
                        </OutlineButton>
                        {(isOwner ? (OWNER_ACTIONS[order.orderStatus] ?? []) : []).map((action) =>
                          action.primary ? (
                            <BrandButton
                              key={action.to}
                              size="small"
                              disableElevation
                              disabled={busyId === order.id}
                              onClick={() => startAction(order, action)}
                              sx={{ fontSize: 12.5, py: 0.4, px: 1.5 }}
                            >
                              {action.label}
                            </BrandButton>
                          ) : (
                            <OutlineButton
                              key={action.to}
                              size="small"
                              disabled={busyId === order.id}
                              onClick={() => startAction(order, action)}
                              sx={{
                                fontSize: 12.5,
                                py: 0.4,
                                px: 1.25,
                                color: action.askReason ? brand.dangerInk : brand.ink,
                                borderColor: action.askReason ? '#FCA5A5' : brand.line,
                                '&:hover': { bgcolor: action.askReason ? brand.dangerBg : undefined }
                              }}
                            >
                              {action.label}
                            </OutlineButton>
                          )
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && (
                <EmptyRow colSpan={columns.length}>
                  <Box sx={{ py: 6, textAlign: 'center' }}>
                    <InboxOutlined style={{ fontSize: 40, color: '#CCD0C8', marginBottom: 12 }} />
                    <Typography variant="body1" sx={{ color: brand.ink, fontWeight: 600 }}>
                      {hasFilter ? 'Không có đơn hàng nào phù hợp với bộ lọc.' : 'Chưa có đơn hàng online nào trong hệ thống.'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: brand.muted, mt: 0.5 }}>
                      {hasFilter
                        ? 'Hãy thử đổi từ khóa, bộ lọc hoặc chọn tab trạng thái khác.'
                        : 'Đơn hàng mới từ khách đặt trên website sẽ xuất hiện tại đây.'}
                    </Typography>
                  </Box>
                </EmptyRow>
              )}
            </TableBody>
          </Table>
        </Box>
        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={PAGE_SIZE}
          noun="đơn hàng"
          onPage={setPage}
        />
      </Box>

      {actionDialog}
    </Box>
  );
}
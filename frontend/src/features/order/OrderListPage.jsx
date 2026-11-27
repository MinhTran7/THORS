import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
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
import { CarOutlined, InboxOutlined, SearchOutlined } from '@ant-design/icons';
import { post } from 'services/http';
import { openCustomerChat, useChatStatus } from 'features/chat/api';
import { useCrumbs } from 'layouts/crumbs';
import { useAuth } from 'features/auth/AuthProvider';
import { PAGE_SIZE } from 'features/account/constants';
import { useDebounced } from 'features/account/hooks';
import { formatTime, parseUtc } from 'features/account/format';
import { brand, cardSx } from 'features/account/tokens';
import { BrandButton, OutlineButton } from 'features/account/components/Brand';
import { StatusPill } from 'features/account/components/Chips';
import {
  DateRangeFilter,
  EmptyRow,
  FilterField,
  FilterResetButton,
  filterInputSx,
  PageHeader,
  Pager,
  Toolbar
} from 'features/account/components/Blocks';
import { PAGE_TYPE } from 'themes/pageType';
import { LIVE_SWR, ordersApi, refreshAllOrders } from './api';
import { CUSTOMER_ACTIONS, OWNER_ACTIONS, ownerActionSlots } from './orderActions';
import { DeliveryProofDialog, useDeliveryProofRequired } from './components/DeliveryProof';
import AddressNotFoundDialog, { ADDRESS_NOT_FOUND, INVALID_ADDRESS_REASON } from './AddressNotFoundDialog';
import DeliveryChoice from './DeliveryChoice';
import { ghnReady } from './GhnAddressFields';
import { customerActionsFor, formatVnd, hasReturn, orderStatusMeta, orderPaymentMeta, paymentMethodLabel, preparationMeta } from './constants';
import {
  C,
  SANS,
  SERIF,
  StatusText,
  StoreThumb,
  TONE_INK,
  dangerBtnSx,
  pageTitleSx,
  panelSx,
  storeBtnSx,
  storeDialogPaperSx,
  storeInputsSx,
  storePagerSx
} from './storeStyle';

// Các tab theo trạng thái đơn: mỗi tab là một hoặc nhiều trạng thái
const STATUS_TABS = [
  { value: 'all', label: 'Tất cả' },
  { value: 'AWAITING_PAYMENT', label: 'Chờ thanh toán' },
  { value: 'PENDING_CONFIRMATION', label: 'Chờ xác nhận' },
  { value: 'AWAITING_PICKUP', label: 'Chờ lấy hàng' },
  { value: 'SHIPPING', label: 'Đang giao' },
  { value: 'DELIVERED', label: 'Đã giao' },
  { value: 'COMPLETED', label: 'Hoàn thành' },
  { value: 'CANCELLED,REJECTED,EXPIRED', label: 'Đã hủy' }
];

// Tab "Trả hàng" của khách: đơn đã nhận còn trong hạn trả (7 ngày từ lúc giao) và đơn đã gửi yêu cầu trả hàng
const RETURNS_TAB = 'RETURNS';

// Khách (kiểu "Đơn mua"): thêm tab "Trả hàng" ngay sau "Hoàn thành", bỏ tab "Chờ thanh toán"
// (đơn chờ thanh toán vẫn nằm trong "Tất cả")
const CUSTOMER_TABS = STATUS_TABS.filter((tab) => tab.value !== 'AWAITING_PAYMENT').flatMap((tab) =>
  tab.value === 'COMPLETED' ? [tab, { value: RETURNS_TAB, label: 'Trả hàng' }] : [tab]
);

// Chủ shop không có việc gì với đơn đang chờ khách thanh toán nên bỏ tab đó (đơn vẫn nằm trong "Tất cả")
const OWNER_TABS = STATUS_TABS.filter((tab) => tab.value !== 'AWAITING_PAYMENT');

// Trạng thái yêu cầu trả hàng (bảng return_request) hiển thị cho khách
const RETURN_STATUS = {
  PENDING: { label: 'Đã gửi yêu cầu trả hàng, chờ cửa hàng duyệt', tone: 'warning' },
  APPROVED: { label: 'Cửa hàng đã chấp nhận trả hàng, vui lòng gửi hàng về', tone: 'neutral' },
  RECEIVED: { label: 'Cửa hàng đã nhận hàng trả, đang xử lý hoàn tiền', tone: 'neutral' },
  COMPLETED: { label: 'Trả hàng hoàn tất', tone: 'success' },
  REJECTED: { label: 'Yêu cầu trả hàng bị từ chối', tone: 'danger' }
};

// Chiều rộng cố định của 2 nút thao tác trên mỗi dòng (vừa chữ dài nhất "Xác nhận đã giao" / "Từ chối đơn")
const ACTION_WIDTH = { primary: 140, secondary: 112 };



// Lý do có sẵn để chọn; chỉ khi chọn "Lý do khác" mới phải tự nhập
const OTHER_REASON = '__OTHER__';
const OWNER_REJECT_REASONS = [
  'Hết hàng',
  'Sản phẩm không còn kinh doanh',
  'Không liên hệ được với khách hàng',
  'Địa chỉ giao hàng không hỗ trợ',
  INVALID_ADDRESS_REASON,
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
  // Backend trả giờ UTC không kèm "Z", nên phải đọc bằng parseUtc thì mới ra đúng ngày giờ VN
  const d = parseUtc(value);
  if (!d) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};

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

// Tình trạng giao hiện ở đầu thẻ đơn của khách
const DELIVERY_NOTE = {
  SHIPPING: 'Đơn hàng đang được giao',
  DELIVERED: 'Giao hàng thành công',
  COMPLETED: 'Giao hàng thành công'
};

function CustomerOrderCard({ order, onOpen, actions, onAction, busy, onRebuy, rebuying, chatAvailable }) {
  const meta = orderStatusMeta(order.orderStatus);
  const pay = orderPaymentMeta(order);
  const returnMeta = order.returnStatus ? RETURN_STATUS[order.returnStatus] ?? { label: order.returnStatus, tone: 'neutral' } : null;
  // Còn hạn trả hàng và chưa có yêu cầu nào (trừ yêu cầu bị từ chối) thì cho gửi yêu cầu trả hàng; mỗi đơn trả một lần
  const canReturn = Boolean(order.returnDeadline) && !hasReturn(order.returnStatus);
  const lines = order.lines ?? [];
  // Mặc định chỉ hiện sản phẩm đầu tiên; bấm "Xem thêm" để mở hết (đơn nhiều sản phẩm không bị dài)
  const [expanded, setExpanded] = useState(false);
  const shownLines = expanded ? lines : lines.slice(0, 1);
  const hiddenCount = lines.length - shownLines.length;

  return (
    <Box component="article" sx={{ ...panelSx, mb: 3, transition: 'border-color .2s', '&:hover': { borderColor: '#CFCAC2' } }}>
      {/* Đầu thẻ: mã đơn, ngày đặt và trạng thái */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 1.5,
          px: { xs: 2, sm: 3 },
          py: 2,
          borderBottom: `1px solid ${C.line}`
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: { xs: 1, sm: 2 } }}>
          <Box component="span" sx={{ fontSize: 14, fontWeight: 600, letterSpacing: '0.04em' }}>
            #{order.orderNumber}
          </Box>
          <Box component="span" sx={{ fontSize: 13, color: C.muted }}>
            {formatDate(order.orderDate)} · {formatTime(order.orderDate)}
          </Box>
        </Box>
        {/* Bên phải: tình trạng giao (nếu có) | trạng thái đơn, giống trang "Đơn mua" quen thuộc */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
          {DELIVERY_NOTE[order.orderStatus] && (
            <>
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 13, color: TONE_INK.success }}>
                <CarOutlined aria-hidden="true" />
                {DELIVERY_NOTE[order.orderStatus]}
              </Box>
              <Box component="span" aria-hidden="true" sx={{ width: '1px', height: 14, bgcolor: C.line }} />
            </>
          )}
          <StatusText tone={meta.tone} label={meta.label.toUpperCase()} />
        </Box>
      </Box>

      {/* Các sản phẩm trong đơn: bấm vào để xem chi tiết */}
      <Box
        role="link"
        tabIndex={0}
        aria-label={`Xem chi tiết đơn ${order.orderNumber}`}
        onClick={onOpen}
        onKeyDown={(e) => (e.key === 'Enter' ? onOpen() : undefined)}
        sx={{ cursor: 'pointer', px: { xs: 2, sm: 3 }, '&:hover .name': { color: C.accent }, '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: '-2px' } }}
      >
        {shownLines.map((line, index) => (
          <Box
            key={`${order.id}-${index}`}
            sx={{ display: 'flex', gap: { xs: 1.5, sm: 2.5 }, py: 2.5, borderBottom: index < shownLines.length - 1 ? `1px solid ${C.line}` : 'none' }}
          >
            <StoreThumb src={line.imageUrl} name={line.productName} width={80} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Box
                className="name"
                sx={{ fontSize: 15, fontWeight: 500, lineHeight: 1.4, transition: 'color .2s', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
              >
                {line.productName}
              </Box>
              {[line.size, line.color].filter(Boolean).length > 0 && (
                <Box sx={{ fontSize: 13, color: C.muted, mt: 0.75 }}>{[line.size, line.color].filter(Boolean).join(' · ')}</Box>
              )}
              <Box sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>Số lượng: {line.quantity}</Box>
            </Box>
            <Box sx={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', alignSelf: 'flex-start' }}>{formatVnd(line.unitPrice)}</Box>
          </Box>
        ))}
        {lines.length === 0 && (
          <Box sx={{ py: 2.5, fontSize: 14, color: C.muted }}>
            {order.firstItemName || '—'} · {order.itemCount} sản phẩm
          </Box>
        )}
      </Box>

      {/* Xem thêm / Thu gọn các sản phẩm còn lại */}
      {lines.length > 1 && (
        <Box
          component="button"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          sx={{
            width: '100%',
            py: 1.5,
            border: 0,
            borderTop: `1px solid ${C.line}`,
            bgcolor: 'transparent',
            font: 'inherit',
            fontSize: 14,
            color: C.muted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 0.75,
            '&:hover': { color: C.accent },
            '&:focus-visible': { outline: `2px solid ${C.accent}`, outlineOffset: '-2px' }
          }}
        >
          {expanded ? 'Thu gọn' : `Xem thêm ${hiddenCount} sản phẩm`}
          <Box component="span" aria-hidden="true" sx={{ display: 'inline-flex', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </Box>
        </Box>
      )}

      {/* Chân thẻ: Thành tiền ở trên bên phải; dưới là dòng nhắc (trái) và các nút (phải) */}
      <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.5, bgcolor: C.sand }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'baseline', gap: 1.25, mb: 2 }}>
          <Box component="span" sx={{ fontSize: 13, color: C.muted }}>
            Thành tiền:
          </Box>
          <Box component="span" sx={{ fontFamily: SERIF, fontSize: 26, color: C.accent }}>
            {formatVnd(order.totalAmount)}
          </Box>
        </Box>

        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
          {/* Dòng nhắc: trạng thái trả hàng hoặc hạn trả hàng, và trạng thái thanh toán */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, fontSize: 12.5, color: C.muted, minWidth: 0 }}>
            {returnMeta && <StatusText tone={returnMeta.tone} label={returnMeta.label} sx={{ fontSize: 11 }} />}
            {!returnMeta && order.returnDeadline && (
              // Ghi cả giờ: hạn là đúng 7 ngày sau lúc giao, không phải hết ngày
              <span>
                Trả hàng trước{' '}
                <Box component="span" sx={{ textDecoration: 'underline', textUnderlineOffset: '2px' }}>
                  {formatTime(order.returnDeadline).slice(0, 5)} {formatDate(order.returnDeadline)}
                </Box>
              </span>
            )}
            <StatusText tone={pay.tone} label={pay.label} sx={{ fontSize: 11 }} />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 1.25, ml: 'auto' }}>
            {/* Nút chính: Đã nhận hàng (đơn đã giao) hoặc Trả hàng (còn hạn, chưa trả) */}
            {actions
              .filter((action) => action.primary)
              .map((action) => (
                <Box key={action.to} component="button" type="button" disabled={busy} onClick={() => onAction(action)} sx={storeBtnSx('dark')}>
                  {action.label.toUpperCase()}
                </Box>
              ))}
            {canReturn && (
              // Sang trang riêng "Yêu cầu trả hàng" (/orders/:id/return), không còn mở hộp thoại
              <Box
                component={RouterLink}
                to={`/orders/${order.id}/return`}
                sx={storeBtnSx(actions.some((a) => a.primary) ? 'outline' : 'dark')}
              >
                YÊU CẦU TRẢ HÀNG / HOÀN TIỀN
              </Box>
            )}
            {/* Mở khung chat với cửa hàng, đính kèm thẻ đơn này vào tin nhắn tiếp theo */}
            {chatAvailable && (
              <Box
                component="button"
                type="button"
                onClick={() => openCustomerChat({ orderId: order.id, orderNumber: order.orderNumber })}
                sx={storeBtnSx('outline')}
              >
                LIÊN HỆ NGƯỜI BÁN
              </Box>
            )}
            {/* Mua lại: chỉ đơn đã hoàn thành */}
            {lines.length > 0 && order.orderStatus === 'COMPLETED' && (
              <Box component="button" type="button" disabled={busy || rebuying} onClick={onRebuy} sx={storeBtnSx('outline')}>
                {rebuying ? 'ĐANG THÊM…' : 'MUA LẠI'}
              </Box>
            )}
            {actions
              .filter((action) => !action.primary)
              .map((action) => (
                <Box key={action.to} component="button" type="button" disabled={busy} onClick={() => onAction(action)} sx={dangerBtnSx}>
                  {action.label.toUpperCase()}
                </Box>
              ))}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

export default function OrderListPage({ fixedSource }) {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { mutate: globalMutate } = useSWRConfig();
  const isCustomer = account.role === 'CUSTOMER';
  const effectiveSource = isCustomer ? undefined : fixedSource || 'WEB';
  const isFacebookPage = effectiveSource === 'FACEBOOK';
  useCrumbs(isCustomer ? ['Đơn hàng'] : ['Bán hàng', isFacebookPage ? 'Đơn hàng Facebook' : 'Đơn hàng online']);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState(''); // yyyy-MM-dd, rỗng = không giới hạn
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
    setStatus('all');
  }, [fixedSource]);
  const [busyId, setBusyId] = useState(null);
  const [rebuyId, setRebuyId] = useState(null); // đơn đang được "Mua lại"
  // Nút "Liên hệ người bán" chỉ hiện khi chat đã bật (database đã chạy migration chat)
  const chat = useChatStatus(isCustomer);

  // Khách bấm "Mua lại": thêm lại các sản phẩm của đơn vào giỏ (đúng biến thể, số lượng) rồi mở giỏ hàng
  const rebuy = async (order) => {
    const lines = (order.lines ?? []).filter((line) => line.detailId);
    if (!lines.length) return;
    setRebuyId(order.id);
    setRowError('');
    let added = 0;
    const failed = [];
    for (const line of lines) {
      try {
        await post('/cart/items', { detailId: line.detailId, quantity: line.quantity });
        added += 1;
      } catch (e) {
        failed.push(`${line.productName}: ${e.message || 'không thêm được'}`);
      }
    }
    setRebuyId(null);
    if (added) window.dispatchEvent(new Event('thors:cart-changed'));
    // Có sản phẩm không thêm được (hết hàng, ngừng bán...): ở lại báo rõ, không chuyển trang để khách đọc được
    if (failed.length) {
      setRowError(
        `Đơn ${order.orderNumber}: ${added ? `đã thêm ${added} sản phẩm vào giỏ, còn` : 'không thêm được'} ${failed.length} sản phẩm lỗi. ${failed.join('; ')}`
      );
      return;
    }
    navigate('/cart');
  };
  const [rowError, setRowError] = useState('');
  const [dialog, setDialog] = useState(null); // { order, action } đang chờ chọn lý do hoặc chọn hình thức giao
  const [reasonChoice, setReasonChoice] = useState(''); // lý do có sẵn đã chọn (hoặc OTHER_REASON)
  const [customReason, setCustomReason] = useState(''); // chỉ dùng khi chọn "Lý do khác"
  const [carrier, setCarrier] = useState('SELF');
  const [ghn, setGhn] = useState(null); // { provinceId, wardId, weightG } khi gửi GHN
  const [addressAlert, setAddressAlert] = useState(null); // { order, message } khi backend báo không tìm thấy địa chỉ
  // Người nhà xử lý đơn như chủ shop nên dùng chung màn hình
  const isOwner = ['OWNER', 'FAMILY_MEMBER'].includes(account.role);
  const [proofOrder, setProofOrder] = useState(null); // đơn đang chờ chụp ảnh minh chứng giao hàng
  const proofRequired = useDeliveryProofRequired(isOwner);
  const search = useDebounced(q.trim());

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const params = {
    status: status === 'all' ? undefined : status,
    q: search || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    source: effectiveSource,
    page,
    size: PAGE_SIZE
  };
  // Danh sách tự tải lại định kỳ để thấy ngay đơn mới và trạng thái mới, không cần reload trang
  const list = useSWR(['orders', params], () => ordersApi.list(params), { keepPreviousData: true, ...LIVE_SWR });
  // Số đơn theo trạng thái cho các tab của chủ shop (lọc đúng theo trang Website hoặc Facebook)
  const counts = useSWR(
    isOwner ? ['order-counts', effectiveSource] : null,
    () => ordersApi.counts({ source: effectiveSource }),
    LIVE_SWR
  );
  const countData = counts.data ?? {};
  // Làm mới mọi dữ liệu đơn hàng (danh sách, số đếm, cả trang chi tiết đang mở trong cache)
  const refresh = () => refreshAllOrders(globalMutate);

  // Các ô trong thanh lọc (không tính tab trạng thái)
  const barFiltered = Boolean(q) || Boolean(dateFrom) || Boolean(dateTo);
  const hasFilter = Boolean(search) || status !== 'all' || barFiltered;
  const resetFilters = () => {
    setQ('');
    setDateFrom('');
    setDateTo('');
    setPage(0);
  };

  // Chủ shop xử lý đơn ngay trên danh sách, không cần vào trang chi tiết
  const runAction = async (order, action, why, carrierValue) => {
    setBusyId(order.id);
    setRowError('');
    try {
      await ordersApi.changeStatus(order.id, action.to, why, carrierValue, ghn);
      setDialog(null);
      await refresh();
    } catch (e) {
      if (e.code === ADDRESS_NOT_FOUND) {
        // Hiện hộp thoại giữa màn hình để chủ shop không bỏ sót, thay cho dòng báo lỗi nhỏ
        setDialog(null);
        setAddressAlert({ order, message: e.message });
      } else {
        const message = e.message || 'Không đổi được trạng thái đơn.';
        // Đang mở hộp thoại thì lỗi chỉ hiện trong hộp thoại; bấm thẳng trên dòng thì báo ở đầu trang, kèm mã đơn
        setRowError(dialog ? message : `Đơn ${order.orderNumber}: ${message}`);
      }
    } finally {
      setBusyId(null);
    }
  };

  // Đóng hộp thoại thao tác: lỗi của hộp thoại không còn ý nghĩa nên xoá luôn, không để lại ở đầu trang
  const closeDialog = () => {
    if (busyId !== null) return;
    setDialog(null);
    setRowError('');
  };

  // Từ hộp thoại "Không tìm thấy địa chỉ": mở luồng từ chối đơn, chọn sẵn lý do địa chỉ không hợp lệ
  const rejectForInvalidAddress = () => {
    const order = addressAlert.order;
    const reject = (OWNER_ACTIONS[order.orderStatus] ?? []).find((a) => a.to === 'REJECTED');
    setAddressAlert(null);
    if (!reject) return;
    setRowError('');
    setReasonChoice(INVALID_ADDRESS_REASON);
    setCustomReason('');
    setDialog({ order, action: reject });
  };

  const startAction = (order, action) => {
    setRowError('');
    if (action.askProof && proofRequired) {
      setProofOrder(order);
    } else if (action.askReason || action.askCarrier) {
      setReasonChoice('');
      setCustomReason('');
      setCarrier('SELF');
      setGhn(null);
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
    <>
    <Dialog
      open={Boolean(dialog)}
      onClose={closeDialog}
      fullWidth
      maxWidth="xs"
      slotProps={{
        paper: {
          sx: isCustomer
            ? {
                ...storeDialogPaperSx,
                ...storeInputsSx,
                '& .MuiButton-root': { borderRadius: '14px', fontFamily: SANS },
                '& .MuiRadio-root.Mui-checked': { color: C.teal }
              }
            : { borderRadius: '16px', p: 1 }
        }
      }}
    >
      <DialogTitle sx={{ pb: 1, fontWeight: 700, fontSize: 18, color: brand.ink }}>{dialog?.action.label}</DialogTitle>
      <DialogContent sx={{ pt: 1 }}>
        {dialog && (
          <Box sx={{ p: 1.5, bgcolor: '#FAFAF7', border: `1px solid ${brand.line}`, borderRadius: '10px', mb: 2 }}>
            <Typography variant="body2" sx={{ color: brand.ink, fontWeight: 700 }}>
              Đơn hàng{' '}
              <span style={{ color: '#DC2626', textDecoration: 'underline', textUnderlineOffset: '3px' }}>#{dialog.order.orderNumber}</span>
            </Typography>
            <Typography variant="body2" sx={{ color: brand.muted, mt: 0.25 }}>
              Người nhận: <strong>{dialog.order.deliveryName}</strong>
            </Typography>
          </Box>
        )}
        {dialog?.action.askCarrier ? (
          <DeliveryChoice
            orderId={dialog.order.id}
            address={dialog.order.deliveryAddress}
            carrier={carrier}
            onChange={setCarrier}
            ghn={ghn}
            onGhnChange={setGhn}
          />
        ) : (
          dialog && (
            <Box>
              <Typography variant="body2" sx={{ color: brand.ink, fontWeight: 600, mb: 0.5 }}>
                Chọn lý do
              </Typography>
              <RadioGroup value={reasonChoice} onChange={(e) => setReasonChoice(e.target.value)}>
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
        <OutlineButton disabled={busyId !== null} onClick={closeDialog} sx={{ px: 2 }}>
          Quay lại
        </OutlineButton>
        {dialog?.action.askCarrier ? (
          <BrandButton
            disabled={busyId !== null || (carrier === 'GHN' && !ghnReady(ghn))}
            onClick={() => runAction(dialog.order, dialog.action, '', carrier)}
            sx={{ px: 2.5 }}
          >
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
    <AddressNotFoundDialog
      value={addressAlert}
      onClose={() => setAddressAlert(null)}
      onReject={addressAlert?.order.orderStatus === 'PENDING_CONFIRMATION' ? rejectForInvalidAddress : undefined}
    />
    <DeliveryProofDialog order={proofOrder} onClose={() => setProofOrder(null)} onDone={refresh} />
    </>
  );

  // Thanh bộ lọc: tìm kiếm, ngày đặt, nguồn đơn (chủ shop); dùng chung cho khách và chủ shop.
  // Mọi ô cùng kiểu với ô lọc ngày dùng chung: nhãn nằm trên ô, cao 44, viền giống nhau.
  const filterBar = (searchPlaceholder) => (
    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1.5 }}>
      <FilterField label="Tìm kiếm" grow>
        <TextField
          fullWidth
          size="small"
          placeholder={searchPlaceholder}
          value={q}
          onChange={(e) => filter(setQ)(e.target.value)}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                </InputAdornment>
              )
            },
            htmlInput: { 'aria-label': 'Tìm kiếm đơn hàng' }
          }}
          sx={filterInputSx()}
        />
      </FilterField>
      {/* Ngày đặt: ô lọc ngày dùng chung cho mọi trang */}
      <DateRangeFilter
        from={dateFrom}
        to={dateTo}
        onChange={({ from, to }) => {
          setDateFrom(from);
          setDateTo(to);
          setPage(0);
        }}
      />

      <FilterResetButton onClick={resetFilters} disabled={!barFiltered} />
    </Box>
  );

  // ---------------------------------------------------------------- Khách hàng (kiểu Shopee)
  if (isCustomer) {
    return (
      <Box>
        <Box sx={{ mb: { xs: 4, sm: 5 } }}>
          <Box component="h1" sx={pageTitleSx}>
            Đơn hàng của tôi
          </Box>
          <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 15, color: C.muted }}>
            Theo dõi các đơn bạn đã đặt tại cửa hàng.
          </Box>
        </Box>

        {/* Một hàng: các tab trạng thái bên trái, ô tìm kiếm gọn bên phải (khách không cần lọc theo ngày) */}
        <Box
          sx={{
            borderBottom: `1px solid ${C.line}`,
            mb: 3,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: { xs: 'wrap', md: 'nowrap' }
          }}
        >
          <Tabs
            value={status}
            onChange={(_, value) => filter(setStatus)(value)}
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            aria-label="Lọc đơn theo trạng thái"
            sx={{
              flex: 1,
              minWidth: 0,
              minHeight: 48,
              '& .MuiTabs-indicator': { bgcolor: C.teal, height: 3, borderRadius: '3px' },
              '& .MuiTab-root': {
                minHeight: 48,
                minWidth: 0,
                px: { xs: 1.5, sm: 2.25 },
                textTransform: 'none',
                fontWeight: 500,
                fontSize: 14,
                color: C.muted,
                '&.Mui-selected': { color: C.ink, fontWeight: 600 },
                '&:hover': { color: C.ink }
              }
            }}
          >
            {CUSTOMER_TABS.map((tab) => (
              <Tab key={tab.value} value={tab.value} label={tab.label} />
            ))}
          </Tabs>
          <Box sx={{ width: { xs: '100%', md: 240 }, flexShrink: 0, pb: { xs: 1.5, md: 0 }, ...storeInputsSx }}>
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm đơn hàng..."
              value={q}
              onChange={(e) => filter(setQ)(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchOutlined style={{ color: '#94A3B8', fontSize: 15 }} />
                    </InputAdornment>
                  )
                },
                htmlInput: { 'aria-label': 'Tìm theo mã đơn hoặc tên sản phẩm' }
              }}
            />
          </Box>
        </Box>

        {rowError && !dialog && (
          <Alert severity="error" onClose={() => setRowError('')} sx={{ mb: 2, borderRadius: '14px' }}>
            {rowError}
          </Alert>
        )}
        {list.error && !list.data && (
          <Alert severity="error" sx={{ mb: 2, borderRadius: '14px' }}>
            {list.error.message}
          </Alert>
        )}

        {items.map((order) => (
          <CustomerOrderCard
            key={order.id}
            order={order}
            busy={busyId === order.id}
            onOpen={() => navigate(`/orders/${order.id}`)}
            actions={customerActionsFor(order, CUSTOMER_ACTIONS)}
            onAction={(action) => startAction(order, action)}
            onRebuy={() => rebuy(order)}
            rebuying={rebuyId === order.id}
            chatAvailable={chat.available}
          />
        ))}

        {!list.isLoading && items.length === 0 && (
          <Box sx={{ bgcolor: C.sand, py: { xs: 8, sm: 10 }, px: 2, textAlign: 'center' }}>
            <Box component="h2" sx={{ m: 0, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 26, sm: 32 } }}>
              {hasFilter ? 'Không tìm thấy đơn hàng nào' : 'Bạn chưa có đơn hàng nào'}
            </Box>
            <Box component="p" sx={{ m: 0, mt: 1.5, mb: hasFilter ? 0 : 4, fontSize: 15, color: C.muted, maxWidth: 420, mx: 'auto' }}>
              {hasFilter
                ? 'Thử thay đổi từ khóa, bộ lọc hoặc chọn tab trạng thái khác.'
                : 'Khám phá bộ sưu tập mới và đặt món đồ đầu tiên của bạn.'}
            </Box>
            {!hasFilter && (
              <Box component={RouterLink} to="/" sx={storeBtnSx('dark')}>
                TIẾP TỤC MUA SẮM
              </Box>
            )}
          </Box>
        )}

        {items.length > 0 && (
          <Box sx={{ ...storePagerSx, mt: 1 }}>
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
  return (
    <Box>
      <Box sx={{ mb: 1 }}>
        <PageHeader
          title={isFacebookPage ? 'Đơn hàng Facebook' : 'Đơn hàng online'}
          subtitle={
            isFacebookPage
              ? 'Xem và xử lý các đơn hàng được tạo từ Facebook Messenger.'
              : 'Xem và xử lý các đơn khách đặt trên website.'
          }
        />
      </Box>

      {rowError && !dialog && (
        <Alert severity="error" onClose={() => setRowError('')} sx={{ mb: 2, borderRadius: '10px' }}>
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
          {OWNER_TABS.map((tab) => (
            <Tab
              key={tab.value}
              value={tab.value}
              label={<TabLabel label={tab.label} count={statusCount(countData, tab.value)} alert={tab.value === 'PENDING_CONFIRMATION'} />}
              // flex: 1 cho các tab giãn đều hết thanh; màn hẹp vẫn cuộn ngang nhờ minWidth
              sx={{ flex: 1, minWidth: { xs: 100, sm: 120 } }}
            />
          ))}
        </Tabs>
      </Box>

      <Toolbar>
        <Box sx={{ flex: 1 }}>{filterBar('Tìm theo mã đơn, người nhận hoặc số điện thoại...')}</Box>
      </Toolbar>

      <Box sx={{ bgcolor: '#FFFFFF', borderRadius: 3.5, border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
        {list.error && !list.data && (
          <Alert severity="error" sx={{ m: 2, borderRadius: '10px' }}>
            {list.error.message}
          </Alert>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          {/* Cùng kiểu bảng "Danh sách hóa đơn" bán tại quầy */}
          <Table size="medium" sx={{ minWidth: 960 }}>
            <TableHead>
              <TableRow
                sx={{ '& th': { borderBottom: '1px solid #E2E8F0', py: 1.75, bgcolor: '#F8FAFC', color: '#475569', fontSize: PAGE_TYPE.th, fontWeight: 600 } }}
              >
                <TableCell align="center" sx={{ width: 64 }}>
                  STT
                </TableCell>
                <TableCell>Mã đơn hàng</TableCell>
                <TableCell>Thời gian</TableCell>
                <TableCell>Người nhận</TableCell>
                <TableCell>Tổng tiền</TableCell>
                <TableCell>Trạng thái</TableCell>
                <TableCell align="center" sx={{ width: ACTION_WIDTH.primary + ACTION_WIDTH.secondary + 56 }}>
                  Thao tác
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((order, i) => {
                const statusMeta = orderStatusMeta(order.orderStatus);
                const prep =
                  order.preparationStatus && order.preparationStatus !== 'NOT_STARTED' ? preparationMeta(order.preparationStatus) : null;
                return (
                  // Bấm vào dòng (hoặc Enter) là mở chi tiết đơn, không cần nút xem riêng
                  <TableRow
                    key={order.id}
                    hover
                    tabIndex={0}
                    role="link"
                    aria-label={`Xem chi tiết đơn ${order.orderNumber}`}
                    onClick={() =>
                      navigate(`/orders/${order.id}`, {
                        state: {
                          backTo: isFacebookPage ? '/facebook-orders' : '/orders',
                          backLabel: isFacebookPage ? 'Quay lại đơn hàng Facebook' : 'Quay lại đơn hàng online'
                        }
                      })
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target === e.currentTarget) {
                        navigate(`/orders/${order.id}`, {
                          state: {
                            backTo: isFacebookPage ? '/facebook-orders' : '/orders',
                            backLabel: isFacebookPage ? 'Quay lại đơn hàng Facebook' : 'Quay lại đơn hàng online'
                          }
                        });
                      }
                    }}
                    sx={{
                      cursor: 'pointer',
                      '&:hover': { bgcolor: '#FAFCFE' },
                      '&:focus-visible': { outline: `2px solid ${brand.cyan}`, outlineOffset: '-2px' },
                      '& td': { borderBottom: '1px solid #F1F5F9', py: 2 }
                    }}
                  >
                    <TableCell align="center" sx={{ fontSize: PAGE_TYPE.td, color: '#64748B' }}>
                      {page * PAGE_SIZE + i + 1}
                    </TableCell>

                    {/* Mã đơn hàng */}
                    <TableCell>
                      <Typography sx={{ fontWeight: 800, fontSize: PAGE_TYPE.td, color: '#1E293B' }}>{order.orderNumber}</Typography>
                    </TableCell>

                    {/* Thời gian đặt */}
                    <TableCell>
                      <Typography sx={{ fontSize: PAGE_TYPE.td, fontWeight: 600, color: '#1E293B' }}>{formatDate(order.orderDate)}</Typography>
                      <Typography sx={{ fontSize: PAGE_TYPE.tdSub, color: '#94A3B8' }}>{formatTime(order.orderDate)}</Typography>
                    </TableCell>

                    {/* Người nhận */}
                    <TableCell>
                      <Typography sx={{ fontSize: PAGE_TYPE.td, fontWeight: 600, color: '#1E293B' }}>{order.deliveryName || '—'}</Typography>
                      <Typography sx={{ fontSize: PAGE_TYPE.tdSub, color: '#94A3B8' }}>{order.deliveryPhone || '—'}</Typography>
                    </TableCell>

                    {/* Tổng tiền & trạng thái thanh toán (để nhận biết đơn đã vào doanh thu hay chưa) */}
                    <TableCell>
                      {(() => {
                        const payMeta = orderPaymentMeta(order);
                        const payColor =
                          payMeta.tone === 'success' ? '#15803D' : payMeta.tone === 'warning' ? '#B45309' : '#64748B';
                        const methodShort =
                          order.paymentMethod === 'COD'
                            ? 'COD'
                            : order.paymentMethod === 'ONLINE'
                              ? 'Chuyển khoản'
                              : paymentMethodLabel(order.paymentMethod);
                        return (
                          <>
                            <Typography sx={{ fontWeight: 800, fontSize: PAGE_TYPE.td, color: '#1E293B', whiteSpace: 'nowrap' }}>
                              {formatVnd(order.totalAmount)}
                            </Typography>
                            <Typography sx={{ fontSize: PAGE_TYPE.tdSub, fontWeight: 600, color: payColor, whiteSpace: 'nowrap' }}>
                              {methodShort} · {payMeta.label}
                            </Typography>
                          </>
                        );
                      })()}
                    </TableCell>

                    {/* Trạng thái đơn */}
                    <TableCell>
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

                    {/* Thao tác: các nút xử lý đơn (bấm nút không mở chi tiết) */}
                    <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} sx={{ cursor: 'default' }}>
                      {/* Lưới cố định: nút chính | nút phụ, nút rộng bằng nhau nên mọi dòng thẳng hàng */}
                      <Box
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: `${ACTION_WIDTH.primary}px ${ACTION_WIDTH.secondary}px`,
                          columnGap: 1,
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >

                        {/* Luôn hiện đủ nút; nút không áp dụng cho trạng thái hiện tại chỉ bị làm mờ */}
                        {(isOwner ? ownerActionSlots(order) : []).map((action) =>
                          action.primary ? (
                            <BrandButton
                              key={action.to}
                              size="small"
                              fullWidth
                              disableElevation
                              disabled={!action.enabled || busyId === order.id}
                              onClick={() => startAction(order, action)}
                              sx={{
                                fontSize: 12.5,
                                py: 0.5,
                                px: 1,
                                whiteSpace: 'nowrap',
                                '&.Mui-disabled': { bgcolor: brand.cyan, color: brand.inkOnCyan, opacity: 0.35 }
                              }}
                            >
                              {action.label}
                            </BrandButton>
                          ) : (
                            <OutlineButton
                              key={action.to}
                              size="small"
                              fullWidth
                              disabled={!action.enabled || busyId === order.id}
                              onClick={() => startAction(order, action)}
                              sx={{
                                fontSize: 12.5,
                                py: 0.5,
                                px: 1,
                                whiteSpace: 'nowrap',
                                color: action.askReason ? brand.dangerInk : brand.ink,
                                borderColor: action.askReason ? '#FCA5A5' : brand.line,
                                '&:hover': { bgcolor: action.askReason ? brand.dangerBg : undefined },
                                '&.Mui-disabled': {
                                  color: action.askReason ? brand.dangerInk : brand.ink,
                                  borderColor: action.askReason ? '#FCA5A5' : brand.line,
                                  opacity: 0.35
                                }
                              }}
                            >
                              {action.label}
                            </OutlineButton>
                          )
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && (
                <EmptyRow colSpan={7}>
                  <Box sx={{ py: 6, textAlign: 'center' }}>
                    <InboxOutlined style={{ fontSize: 40, color: '#CBD5E1', marginBottom: 12 }} />
                    <Typography variant="body1" sx={{ color: brand.ink, fontWeight: 600 }}>
                      {hasFilter
                        ? 'Không có đơn hàng nào phù hợp với bộ lọc.'
                        : isFacebookPage
                          ? 'Chưa có đơn hàng Facebook nào trong hệ thống.'
                          : 'Chưa có đơn hàng online nào trong hệ thống.'}
                    </Typography>
                    <Typography variant="body2" sx={{ color: brand.muted, mt: 0.5 }}>
                      {hasFilter
                        ? 'Hãy thử đổi từ khóa, bộ lọc hoặc chọn tab trạng thái khác.'
                        : isFacebookPage
                          ? 'Đơn hàng chốt từ màn hình Kênh bán hàng > Facebook sẽ xuất hiện tại đây.'
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
          sx={{ borderTop: '1px solid #F1F5F9' }}
        />
      </Box>

      {actionDialog}
    </Box>
  );
}

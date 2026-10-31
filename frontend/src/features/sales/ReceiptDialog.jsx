import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  Divider,
  Stack,
  Typography
} from '@mui/material';
import { PrinterOutlined, PlusOutlined } from '@ant-design/icons';

const C = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  main: '#8DE9F2',
  bg: '#F8FAFC',
  cancelHover: '#FFFBE7'
};

const buttonSx = {
  textTransform: 'none',
  borderRadius: 2,
  fontWeight: 600
};

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;

const formatDateTime = (date) => {
  if (!date) return '—';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
};

/**
 * Dialog hiển thị hóa đơn hoàn tất và cho phép in.
 *
 * Props:
 *  - open:            boolean
 *  - onClose:         () => void  — đóng dialog và bắt đầu lượt bán mới
 *  - saleData:        InStoreSaleResponse từ Backend
 *  - cartItems:       mảng cart tại thời điểm hoàn tất
 *  - customerName:    string | ''
 *  - sellerName:      string      — account.fullName của người đang đăng nhập
 *  - amountReceived:  number      — số tiền khách đưa (chỉ cho Cash)
 *  - changeDue:       number      — tiền thừa (chỉ cho Cash)
 *  - completedAt:     Date        — thời điểm tạo đơn thành công
 */
export default function ReceiptDialog({
  open,
  onClose,
  saleData,
  cartItems = [],
  customerName = '',
  sellerName = '',
  amountReceived = 0,
  changeDue = 0,
  completedAt
}) {
  if (!saleData) return null;

  const isCash = saleData.paymentMethod === 'CASH';
  const displayCustomer = customerName.trim() || 'Walk-in customer';
  const displaySeller = sellerName.trim() || '—';

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* CSS chế độ in — chỉ in khối receipt-printable, ẩn toàn bộ layout */}
      <style>{`
        @media print {
          html, body {
            height: auto !important;
            overflow: hidden !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          body * { visibility: hidden !important; }
          #receipt-printable,
          #receipt-printable * { visibility: visible !important; }
          #receipt-printable {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 80mm !important;
            padding: 6mm !important;
            background: #fff !important;
            font-size: 11px !important;
            font-family: 'Courier New', Courier, monospace !important;
            color: #000 !important;
            page-break-after: avoid !important;
          }
        }
      `}</style>

      <Dialog
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            width: '100%',
            maxWidth: 420,
            m: 1.5,
            borderRadius: 3,
            boxShadow: '0 8px 32px rgba(32,45,66,0.14)'
          }
        }}
      >
        <DialogContent sx={{ p: 0, pb: 1 }}>
          {/* ─── Khối nội dung in được ─── */}
          <Box
            id="receipt-printable"
            sx={{
              p: 2.5,
              bgcolor: '#fff',
              fontFamily: '"Courier New", Courier, monospace'
            }}
          >
            {/* Header cửa hàng */}
            <Box sx={{ textAlign: 'center', mb: 1.5 }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: 1 }}>
                THORS
              </Typography>
              <Typography sx={{ fontSize: 10.5, color: C.muted }}>
                Omnichannel Retail System
              </Typography>
              <Typography sx={{ fontSize: 10.5, color: C.muted, mt: 0.25 }}>
                In-store Sales Receipt
              </Typography>
            </Box>

            <Divider sx={{ borderStyle: 'dashed', borderColor: C.border, mb: 1.25 }} />

            {/* Thông tin hóa đơn — lấy từ Backend response */}
            <Stack spacing={0.4} sx={{ mb: 1.25, fontSize: 11 }}>
              <ReceiptRow label="Invoice #" value={saleData.invoiceNumber} />
              <ReceiptRow label="Order #" value={saleData.orderNumber} />
              <ReceiptRow label="Date" value={formatDateTime(completedAt)} />
              <ReceiptRow label="Cashier" value={displaySeller} />
              <ReceiptRow label="Customer" value={displayCustomer} />
            </Stack>

            <Divider sx={{ borderStyle: 'dashed', borderColor: C.border, mb: 1.25 }} />

            {/* Danh sách sản phẩm */}
            <Box sx={{ mb: 1.25 }}>
              {cartItems.map((line) => (
                <Box key={line.key} sx={{ mb: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.text,
                      wordBreak: 'break-word'
                    }}
                  >
                    {line.name}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: C.muted }}>
                    {line.size || 'Default'} / {line.color || 'Default'}
                  </Typography>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography sx={{ fontSize: 10.5, color: C.muted }}>
                      {line.quantity} × {money(line.price)}
                    </Typography>
                    <Typography sx={{ fontSize: 10.5, fontWeight: 600, color: C.text }}>
                      {money(line.price * line.quantity)}
                    </Typography>
                  </Stack>
                </Box>
              ))}
            </Box>

            <Divider sx={{ borderStyle: 'dashed', borderColor: C.border, mb: 1.25 }} />

            {/* Tổng kết tiền — lấy từ Backend response */}
            <Stack spacing={0.5} sx={{ mb: 1.25 }}>
              <ReceiptRow label="Subtotal" value={money(saleData.itemsAmount)} />
              {Number(saleData.discountAmount) > 0 && (
                <ReceiptRow label="Discount" value={`− ${money(saleData.discountAmount)}`} />
              )}
              <Divider sx={{ borderStyle: 'dashed', borderColor: C.border }} />
              <ReceiptRow
                label="TOTAL"
                value={money(saleData.totalAmount)}
                strong
              />
            </Stack>

            {/* Thông tin thanh toán — lấy từ Backend response */}
            <Stack spacing={0.4} sx={{ mb: 1 }}>
              <ReceiptRow
                label="Payment"
                value={saleData.paymentMethod === 'CASH' ? 'Cash' : 'Bank Transfer'}
              />
              {isCash && (
                <>
                  <ReceiptRow label="Received" value={money(amountReceived)} />
                  <ReceiptRow label="Change" value={money(changeDue)} />
                </>
              )}
              <ReceiptRow label="Status" value={saleData.paymentStatus} />
            </Stack>

            <Divider sx={{ borderStyle: 'dashed', borderColor: C.border, mb: 1 }} />

            <Typography
              sx={{
                textAlign: 'center',
                fontSize: 10,
                color: C.muted,
                letterSpacing: 0.5
              }}
            >
              Thank you for shopping at THORS!
            </Typography>
          </Box>
          {/* ─── Kết thúc khối nội dung in ─── */}
        </DialogContent>

        <DialogActions sx={{ px: 2.5, pb: 2, pt: 0.5, gap: 1 }}>
          {/* Nút in hóa đơn */}
          <Button
            variant="contained"
            startIcon={<PrinterOutlined />}
            onClick={handlePrint}
            sx={{
              ...buttonSx,
              flex: 1,
              py: 1,
              bgcolor: C.text,
              color: '#fff',
              '&:hover': { bgcolor: '#2C3E55' }
            }}
          >
            Print Receipt
          </Button>

          {/* Nút bắt đầu lượt bán mới */}
          <Button
            variant="contained"
            startIcon={<PlusOutlined />}
            onClick={onClose}
            sx={{
              ...buttonSx,
              flex: 1,
              py: 1,
              bgcolor: C.main,
              color: C.text,
              '&:hover': { bgcolor: '#6BDCE7' }
            }}
          >
            New Sale
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

/** Dòng thông tin nhãn – giá trị trong hóa đơn */
function ReceiptRow({ label, value, strong = false }) {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="baseline">
      <Typography
        sx={{
          fontSize: 11,
          color: strong ? C.text : C.muted,
          fontWeight: strong ? 700 : 400,
          flexShrink: 0,
          mr: 1
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: strong ? 13 : 11,
          color: C.text,
          fontWeight: strong ? 800 : 500,
          textAlign: 'right',
          wordBreak: 'break-all'
        }}
      >
        {value ?? '—'}
      </Typography>
    </Stack>
  );
}

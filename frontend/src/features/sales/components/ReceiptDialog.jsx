import { Box, Button, Dialog, DialogActions, DialogContent, Divider, Stack, Typography } from '@mui/material';
import { PrinterOutlined, PlusOutlined } from '@ant-design/icons';
import { NO_EFFECTS } from '../theme';
import { formatDateTime, money } from '../utils';

const C = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  main: '#8DE9F2'
};

const buttonSx = {
  textTransform: 'none',
  borderRadius: 2,
  fontWeight: 600
};

// sale: chi tiết hóa đơn từ backend (GET/POST /sales/in-store)
export default function ReceiptDialog({ open, onClose, sale, closeText = 'Bán đơn mới', receivedAmount, changeAmount }) {
  if (!sale) return null;

  const received = receivedAmount ?? (sale.paymentMethod === 'CASH' ? sale.totalAmount : 0);
  const change = changeAmount ?? 0;

  return (
    <>
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 5mm;
          }
          /* Loại bỏ hoàn toàn ứng dụng (#root) và các overlay khác khỏi flow in */
          body > *:not(.MuiDialog-root) {
            display: none !important;
          }
          /* Ẩn backdrop xám và các nút bấm của Dialog */
          .MuiBackdrop-root,
          .MuiDialogActions-root {
            display: none !important;
          }
          /* Reset container của Dialog để không chiếm chiều cao toàn màn hình */
          .MuiDialog-root {
            position: static !important;
            inset: auto !important;
            z-index: auto !important;
          }
          .MuiDialog-container {
            display: block !important;
            height: auto !important;
            padding: 0 !important;
          }
          .MuiDialog-paper {
            margin: 0 auto !important;
            padding: 0 !important;
            max-width: 80mm !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
          }
          .MuiDialogContent-root {
            padding: 0 !important;
            overflow: visible !important;
          }
          #receipt-printable {
            width: 100% !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 2mm !important;
            box-sizing: border-box !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      <Dialog
        className={NO_EFFECTS}
        open={open}
        onClose={onClose}
        fullWidth
        maxWidth="xs"
        slotProps={{
          paper: {
            sx: {
              width: '100%',
              maxWidth: 420,
              m: 1.5,
              borderRadius: 3,
              boxShadow: '0 8px 32px rgba(32,45,66,0.14)'
            }
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
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, letterSpacing: 1 }}>THORS</Typography>
              <Typography sx={{ fontSize: 10.5, color: C.muted }}>Hệ thống bán lẻ THORS</Typography>
              <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.text, mt: 0.5, letterSpacing: 0.5 }}>HÓA ĐƠN BÁN HÀNG</Typography>
            </Box>

            <Divider sx={{ borderStyle: 'dashed', borderColor: C.border, mb: 1.25 }} />

            {/* Thông tin hóa đơn — lấy từ Backend response */}
            <Stack spacing={0.4} sx={{ mb: 1.25, fontSize: 11 }}>
              <ReceiptRow label="Số hóa đơn" value={sale.invoiceNumber} />
              <ReceiptRow label="Thời gian" value={formatDateTime(sale.orderDate)} />
              <ReceiptRow label="Người bán" value={sale.sellerName || '—'} />
              <ReceiptRow label="Khách hàng" value="Khách mua tại quầy" />
            </Stack>

            <Divider sx={{ borderStyle: 'dashed', borderColor: C.border, mb: 1.25 }} />

            {/* Danh sách sản phẩm */}
            <Box sx={{ mb: 1.25 }}>
              {sale.items.map((line) => (
                <Box key={line.orderItemId} sx={{ mb: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: C.text,
                      wordBreak: 'break-word'
                    }}
                  >
                    {line.productName || 'Sản phẩm'}
                  </Typography>
                  <Typography sx={{ fontSize: 10, color: C.muted }}>
                    {line.size ? `Size: ${line.size}` : 'Mặc định'} {line.color ? `/ Màu: ${line.color}` : ''}
                  </Typography>
                  <Box
                    sx={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      width: '100%',
                      mt: 0.5
                    }}
                  >
                    <Typography sx={{ fontSize: 11, color: C.muted }}>
                      {line.quantity} ×{' '}
                      {line.originalPrice > line.unitPrice && (
                        <Box component="span" sx={{ textDecoration: 'line-through', mr: 0.5 }}>
                          {money(line.originalPrice)}
                        </Box>
                      )}
                      {money(line.unitPrice)}
                    </Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 700, color: C.text, ml: 'auto' }}>{money(line.totalPrice)}</Typography>
                  </Box>
                </Box>
              ))}
            </Box>

            <Divider sx={{ borderStyle: 'dashed', borderColor: C.border, mb: 1.25 }} />

            {/* Tổng kết tiền — lấy từ Backend response */}
            <Stack spacing={0.5} sx={{ mb: 1.25 }}>
              <ReceiptRow label="Tổng tiền hàng" value={money(sale.subtotal)} />
              {sale.manualDiscount > 0 && <ReceiptRow label="Giảm giá thêm" value={`− ${money(sale.manualDiscount)}`} />}
              <Divider sx={{ borderStyle: 'dashed', borderColor: C.border }} />
              <ReceiptRow label="TỔNG THANH TOÁN" value={money(sale.totalAmount)} strong />
              <Typography sx={{ fontSize: 10, color: C.muted, textAlign: 'right' }}>Giá bán đã bao gồm thuế</Typography>
            </Stack>

            {/* Thông tin thanh toán — lấy từ Backend response */}
            <Stack spacing={0.4} sx={{ mb: 1 }}>
              <ReceiptRow label="Phương thức" value={sale.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản'} />
              {sale.paymentMethod === 'CASH' && (
                <>
                  <ReceiptRow label="Tiền nhận" value={money(received)} />
                  <ReceiptRow label="Tiền trả lại" value={money(change)} />
                </>
              )}
              <ReceiptRow label="Trạng thái" value={sale.paymentStatus === 'PAID' ? 'Đã thanh toán' : sale.paymentStatus} />
            </Stack>

            <Divider sx={{ borderStyle: 'dashed', borderColor: C.border, mb: 1 }} />

            <Typography
              sx={{
                textAlign: 'center',
                fontSize: 10.5,
                color: C.muted,
                letterSpacing: 0.3
              }}
            >
              Cảm ơn quý khách đã mua sắm tại THORS!
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 2.5, pb: 2, pt: 0.5, gap: 1 }}>
          {/* Nút in hóa đơn */}
          <Button
            variant="contained"
            startIcon={<PrinterOutlined />}
            onClick={() => window.print()}
            sx={{
              ...buttonSx,
              flex: 1,
              py: 1,
              bgcolor: C.text,
              color: '#fff',
              '&:hover': { bgcolor: C.text }
            }}
          >
            In hóa đơn
          </Button>

          <Button
            variant="contained"
            startIcon={closeText === 'Bán đơn mới' ? <PlusOutlined /> : undefined}
            onClick={onClose}
            sx={{
              ...buttonSx,
              flex: 1,
              py: 1,
              bgcolor: C.main,
              color: C.text,
              '&:hover': { bgcolor: C.main }
            }}
          >
            {closeText}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

function ReceiptRow({ label, value, strong = false }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }}>
      <Typography
        sx={{
          fontSize: strong ? 12 : 11,
          color: strong ? C.text : C.muted,
          fontWeight: strong ? 800 : 400,
          flexShrink: 0,
          mr: 2
        }}
      >
        {label}
      </Typography>
      <Typography
        sx={{
          fontSize: strong ? 14 : 11,
          color: C.text,
          fontWeight: strong ? 800 : 500,
          textAlign: 'right',
          wordBreak: 'break-all',
          ml: 'auto'
        }}
      >
        {value ?? '—'}
      </Typography>
    </Box>
  );
}

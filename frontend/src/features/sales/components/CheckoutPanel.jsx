import { Box, Button, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import {
  BankOutlined,
  CheckOutlined,
  DeleteOutlined,
  DollarOutlined,
  EditOutlined,
  FileTextOutlined,
  QrcodeOutlined
} from '@ant-design/icons';
import { C, choiceSx, primaryButtonSx } from '../theme';
import { formatNumberInput, money } from '../utils';

const PAYMENTS = [
  { transfer: false, label: 'Tiền mặt', icon: <DollarOutlined /> },
  { transfer: true, label: 'Chuyển khoản', icon: <BankOutlined /> }
];

// Cột phải: các hóa đơn chờ, tổng tiền, giảm giá, phương thức thanh toán
export default function CheckoutPanel({
  orders,
  activeOrder,
  onSwitch,
  onCloseTab,
  onAddTab,
  subtotal,
  discountType,
  discountNumber,
  discountValue,
  onOpenDiscount,
  total,
  customerPaid,
  onCustomerPaid,
  changeAmount,
  submitting,
  onComplete,
  onCancel,
  onTransfer,
  onOpenTransfer
}) {
  const waiting = Boolean(activeOrder.transfer);
  return (
    <Box
      sx={{
        bgcolor: C.surface,
        borderRadius: 3.5,
        border: `1px solid ${C.border}`,
        px: { xs: 2, sm: 2.25 },
        py: 1.5,
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        minHeight: 0,
        alignSelf: 'start',
        maxHeight: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        '& > *': { flexShrink: 0 }
      }}
    >
      {/* Thanh danh sách tab hóa đơn chờ kiểu Sapo */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.5, overflowX: 'auto', pb: 0.25 }}>
        {orders.map((ord) => {
          const isActiveTab = ord.id === activeOrder.id;

          return (
            <Box
              key={ord.id}
              onClick={() => onSwitch(ord.id)}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.75,
                px: 1.25,
                py: 0.5,
                borderRadius: 2,
                cursor: 'pointer',
                bgcolor: isActiveTab ? C.yellow : C.borderLight,
                border: '1.5px solid',
                borderColor: isActiveTab ? C.yellowBorder : C.border,
                color: isActiveTab ? C.yellowText : C.muted,
                fontWeight: 600,
                fontSize: 12,
                whiteSpace: 'nowrap',
                userSelect: 'none',
                boxSizing: 'border-box'
              }}
            >
              <span>{ord.transfer ? `${ord.label} · QR` : ord.label}</span>
              {orders.length > 1 && (
                <Box
                  component="span"
                  onClick={(e) => onCloseTab(ord.id, e)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 15,
                    height: 15,
                    borderRadius: 99,
                    fontSize: 11,
                    color: C.subtle,
                    ml: 0.25
                  }}
                  title="Đóng hóa đơn này"
                >
                  ×
                </Box>
              )}
            </Box>
          );
        })}

        {/* Nút thêm tab hóa đơn mới (+) */}
        <Box
          component="button"
          type="button"
          onClick={onAddTab}
          title="Mở thêm hóa đơn cho khách tiếp theo"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 1.75,
            bgcolor: C.surface,
            border: `1.5px dashed ${C.faint}`,
            color: C.body,
            cursor: 'pointer',
            fontSize: 15,
            fontWeight: 700,
            flexShrink: 0,
            outline: 'none'
          }}
        >
          +
        </Box>
      </Box>

      {/* Header hóa đơn */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.5, mb: 0.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <FileTextOutlined style={{ fontSize: 18, color: C.text }} />
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: C.text }}>{activeOrder?.label || 'Hóa đơn hiện tại'}</Typography>
        </Box>
        <Box
          sx={{
            bgcolor: C.yellow,
            color: C.yellowText,
            border: `1px solid ${C.yellowBorder}`,
            borderRadius: 99,
            px: 1.25,
            py: 0.35,
            fontSize: 11.5,
            fontWeight: 700
          }}
        >
          {waiting ? 'Chờ chuyển khoản' : 'Đang tạo'}
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Tổng tiền hàng & Giảm giá */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.75, borderTop: `1px solid ${C.borderLight}` }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 13, color: C.muted }}>Tổng tiền hàng</Typography>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{money(subtotal)}</Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: 13, color: C.muted }}>
                Giảm giá{discountType === 'percent' && discountNumber > 0 ? ` (${discountNumber}%)` : ''}
              </Typography>
              <IconButton size="small" disabled={waiting} onClick={onOpenDiscount} sx={{ p: 0.25, color: C.muted }}>
                <EditOutlined style={{ fontSize: 12 }} />
              </IconButton>
            </Box>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: discountValue > 0 ? C.green : C.text }}>
              {discountValue > 0 ? `-${money(discountValue)}` : '-0 đ'}
            </Typography>
          </Box>

          {/* Tổng phải trả */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              pt: 0.5,
              mt: 0.25,
              borderTop: `1px dashed ${C.border}`
            }}
          >
            <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: C.text }}>Tổng phải trả</Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 800, color: C.text }}>{money(total)}</Typography>
          </Box>
        </Box>

        {/* Phương thức thanh toán */}
        <Box sx={{ mt: 0.75 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.label, mb: 0.5 }}>Phương thức thanh toán</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            {PAYMENTS.map((opt) => (
              <Box
                key={opt.label}
                component="button"
                type="button"
                disabled={waiting || submitting}
                onClick={opt.transfer ? onTransfer : undefined}
                sx={{ ...choiceSx(opt.transfer === waiting), height: 34 }}
              >
                {opt.icon}
                <span>{opt.label}</span>
              </Box>
            ))}
          </Box>
          {!waiting && (
            <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Tiền khách trả</Typography>
                <TextField
                  size="small"
                  placeholder={total > 0 ? Number(total).toLocaleString('vi-VN') : '0'}
                  value={customerPaid}
                  onChange={(e) => onCustomerPaid(formatNumberInput(e.target.value))}
                  slotProps={{
                    input: { endAdornment: <InputAdornment position="end">đ</InputAdornment> },
                    htmlInput: { inputMode: 'numeric' }
                  }}
                  sx={{
                    width: 140,
                    '& .MuiOutlinedInput-root': {
                      borderRadius: 2,
                      height: 32,
                      fontSize: 13,
                      fontWeight: 700
                    },
                    '& input': { textAlign: 'right', py: 0.5 }
                  }}
                />
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>Tiền trả lại khách</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: changeAmount > 0 ? C.green : C.text }}>
                  {money(changeAmount)}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box sx={{ mt: 5 }}>
        <Button
          fullWidth
          variant="contained"
          onClick={waiting ? onOpenTransfer : onComplete}
          disabled={submitting}
          startIcon={!submitting && (waiting ? <QrcodeOutlined /> : <CheckOutlined />)}
          sx={{ ...primaryButtonSx, fontWeight: 800, fontSize: 13.5, height: 38 }}
        >
          {waiting ? 'Mở mã QR' : submitting ? 'Đang xử lý...' : 'Hoàn tất thanh toán'}
        </Button>

        <Box sx={{ textAlign: 'center', mt: 0.75, visibility: waiting ? 'hidden' : 'visible' }}>
          <Button
            size="small"
            onClick={onCancel}
            disabled={submitting}
            startIcon={<DeleteOutlined style={{ fontSize: 12 }} />}
            sx={{
              color: C.muted,
              fontSize: 12,
              fontWeight: 600,
              textTransform: 'none'
            }}
          >
            Hủy hóa đơn
          </Button>
        </Box>
      </Box>
    </Box>
  );
}

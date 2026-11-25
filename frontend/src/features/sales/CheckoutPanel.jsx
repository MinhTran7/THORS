import { Box, Button, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { BankOutlined, CheckOutlined, DeleteOutlined, DollarOutlined, EditOutlined, FileTextOutlined } from '@ant-design/icons';
import { formatNumberInput, money } from './salesFormat';

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
  payment,
  onPayment,
  customerPaid,
  onCustomerPaid,
  changeAmount,
  submitting,
  onComplete,
  onCancel
}) {
  return (
    <Box
      sx={{
        bgcolor: '#FFFFFF',
        borderRadius: 3.5,
        border: '1px solid #E2E8F0',
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
                bgcolor: isActiveTab ? '#FEF9C3' : '#F1F5F9',
                border: '1.5px solid',
                borderColor: isActiveTab ? '#FDE047' : '#E2E8F0',
                color: isActiveTab ? '#854D0E' : '#64748B',
                fontWeight: 600,
                fontSize: 12,
                whiteSpace: 'nowrap',
                userSelect: 'none',
                boxSizing: 'border-box'
              }}
            >
              <span>{ord.label}</span>
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
                    color: '#94A3B8',
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
            bgcolor: '#FFFFFF',
            border: '1.5px dashed #CBD5E1',
            color: '#475569',
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
          <FileTextOutlined style={{ fontSize: 18, color: '#0F172A' }} />
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: '#0F172A' }}>{activeOrder?.label || 'Hóa đơn hiện tại'}</Typography>
        </Box>
        <Box
          sx={{
            bgcolor: '#FEF9C3',
            color: '#854D0E',
            border: '1px solid #FDE047',
            borderRadius: 99,
            px: 1.25,
            py: 0.35,
            fontSize: 11.5,
            fontWeight: 700
          }}
        >
          Đang tạo
        </Box>
      </Box>

      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Tổng tiền hàng & Giảm giá */}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, py: 0.75, borderTop: '1px solid #F1F5F9' }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography sx={{ fontSize: 13, color: '#64748B' }}>Tổng tiền hàng</Typography>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>{money(subtotal)}</Typography>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
              <Typography sx={{ fontSize: 13, color: '#64748B' }}>
                Giảm giá{discountType === 'percent' && discountNumber > 0 ? ` (${discountNumber}%)` : ''}
              </Typography>
              <IconButton size="small" onClick={onOpenDiscount} sx={{ p: 0.25, color: '#64748B' }}>
                <EditOutlined style={{ fontSize: 12 }} />
              </IconButton>
            </Box>
            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: discountValue > 0 ? '#10B981' : '#0F172A' }}>
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
              borderTop: '1px dashed #E2E8F0'
            }}
          >
            <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: '#0F172A' }}>Tổng phải trả</Typography>
            <Typography sx={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>{money(total)}</Typography>
          </Box>
        </Box>

        {/* Phương thức thanh toán */}
        <Box sx={{ mt: 0.75 }}>
          <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#334155', mb: 0.5 }}>Phương thức thanh toán</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Box
              component="button"
              type="button"
              onClick={() => onPayment('Cash')}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                fontFamily: 'inherit',
                bgcolor: payment === 'Cash' ? '#FEF9C3' : '#FFFFFF',
                border: `1.5px solid ${payment === 'Cash' ? '#FDE047' : '#E2E8F0'}`,
                color: payment === 'Cash' ? '#854D0E' : '#475569',
                fontWeight: 700,
                fontSize: 13,
                height: 34,
                borderRadius: 2.5,
                cursor: 'pointer',
                boxShadow: 'none',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                userSelect: 'none'
              }}
            >
              <DollarOutlined />
              <span>Tiền mặt</span>
            </Box>

            <Box
              component="button"
              type="button"
              onClick={() => onPayment('Bank transfer')}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1,
                fontFamily: 'inherit',
                bgcolor: payment === 'Bank transfer' ? '#FEF9C3' : '#FFFFFF',
                border: `1.5px solid ${payment === 'Bank transfer' ? '#FDE047' : '#E2E8F0'}`,
                color: payment === 'Bank transfer' ? '#854D0E' : '#475569',
                fontWeight: 700,
                fontSize: 13,
                height: 34,
                borderRadius: 2.5,
                cursor: 'pointer',
                boxShadow: 'none',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                userSelect: 'none'
              }}
            >
              <BankOutlined />
              <span>Chuyển khoản</span>
            </Box>
          </Box>
          {payment === 'Cash' && (
            <Box sx={{ mt: 0.75, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography sx={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Tiền khách trả</Typography>
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
                <Typography sx={{ fontSize: 13, color: '#64748B', fontWeight: 600 }}>Tiền trả lại khách</Typography>
                <Typography sx={{ fontSize: 14, fontWeight: 800, color: changeAmount > 0 ? '#10B981' : '#0F172A' }}>
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
          onClick={onComplete}
          disabled={submitting}
          startIcon={!submitting && <CheckOutlined />}
          sx={{
            bgcolor: '#8EECF5',
            '&:hover': { bgcolor: '#8EECF5' },
            color: '#0F172A',
            fontWeight: 800,
            fontSize: 13.5,
            height: 38,
            borderRadius: 2.5,
            textTransform: 'none',
            boxShadow: 'none',
            '&.Mui-disabled': {
              bgcolor: '#E2E8F0',
              color: '#94A3B8'
            }
          }}
        >
          {submitting ? 'Đang xử lý...' : 'Hoàn tất thanh toán'}
        </Button>

        <Box sx={{ textAlign: 'center', mt: 0.75 }}>
          <Button
            size="small"
            onClick={onCancel}
            disabled={submitting}
            startIcon={<DeleteOutlined style={{ fontSize: 12 }} />}
            sx={{
              color: '#64748B',
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

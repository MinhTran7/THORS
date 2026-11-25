import { useState } from 'react';
import { Box, IconButton, Typography } from '@mui/material';
import { CloseOutlined, MinusOutlined, PlusOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { money } from './salesFormat';

// Các dòng hàng của hóa đơn đang mở
export default function CartLines({ cart, otherTabsQty, onInfo, onEdit, onStep, onSetQuantity, onRemove }) {
  const [qtyDraft, setQtyDraft] = useState({});

  function commitQuantity(line) {
    const raw = qtyDraft[line.key];
    setQtyDraft((prev) => {
      const next = { ...prev };
      delete next[line.key];
      return next;
    });
    const qty = parseInt(raw, 10);
    if (!isNaN(qty)) onSetQuantity(line, qty);
  }

  return (
    <Box
      sx={{
        bgcolor: '#FFFFFF',
        borderRadius: 3.5,
        border: '1px solid #E2E8F0',
        p: { xs: 2, sm: 2.5 },
        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
        '&::-webkit-scrollbar': { display: 'none' }
      }}
    >
      {/* Danh sách món hàng trong giỏ */}
      <Box
        sx={{
          flex: '1 0 auto',
          minHeight: { xs: 240, lg: 0 },
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {!cart.length ? (
          <Box
            sx={{
              flex: 1,
              minHeight: { xs: 240, lg: 0 },
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#F8FAFC',
              borderRadius: 2.5,
              p: 2,
              textAlign: 'center'
            }}
          >
            <ShoppingCartOutlined style={{ fontSize: 30, color: '#CBD5E1', marginBottom: 8 }} />
            <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#475569' }}>Chưa có sản phẩm nào</Typography>
            <Typography sx={{ fontSize: 11.5, color: '#94A3B8', mt: 0.25 }}>
              Tìm và chọn sản phẩm ở thanh tìm kiếm để thêm vào hóa đơn
            </Typography>
          </Box>
        ) : (
          cart.map((line, index) => (
            <Box
              key={line.key}
              sx={{
                py: 1.25,
                borderBottom: '1px solid #F1F5F9',
                display: 'flex',
                alignItems: 'center',
                gap: 1.25
              }}
            >
              <Typography sx={{ width: 22, fontSize: 12.5, fontWeight: 700, color: '#94A3B8', textAlign: 'center', flexShrink: 0 }}>
                {index + 1}
              </Typography>
              <Box
                component="img"
                src={line.image || undefined}
                alt={line.name}
                onClick={() => onInfo(line)}
                sx={{
                  cursor: 'pointer',
                  width: 44,
                  height: 44,
                  borderRadius: 2,
                  objectFit: 'cover',
                  bgcolor: '#F8FAFC',
                  flexShrink: 0,
                  border: '1px solid #E2E8F0'
                }}
              />
              <Box onClick={() => onEdit(line)} sx={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#0F172A',
                    lineHeight: 1.3,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {line.name}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25, flexWrap: 'wrap' }}>
                  {(line.size || line.color) && (
                    <Typography sx={{ fontSize: 11.5, color: '#64748B' }}>{[line.size, line.color].filter(Boolean).join(' · ')}</Typography>
                  )}
                  {(line.size || line.color) && <Typography sx={{ fontSize: 11.5, color: '#CBD5E1' }}>•</Typography>}
                  {line.originalPrice > line.price && (
                    <Typography sx={{ fontSize: 11.5, color: '#94A3B8', textDecoration: 'line-through' }}>
                      {money(line.originalPrice)}
                    </Typography>
                  )}
                  <Typography sx={{ fontSize: 11.5, fontWeight: 600, color: '#475569' }}>{money(line.price)}</Typography>
                </Box>
              </Box>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  flexShrink: 0
                }}
              >
                <IconButton size="small" onClick={() => onStep(line.key, -1)} sx={{ p: 0.5 }}>
                  <MinusOutlined style={{ fontSize: 10, color: '#475569' }} />
                </IconButton>
                <Box
                  component="input"
                  type="text"
                  inputMode="numeric"
                  value={qtyDraft[line.key] ?? line.quantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setQtyDraft((prev) => ({ ...prev, [line.key]: val }));
                  }}
                  onBlur={() => commitQuantity(line)}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                  sx={{
                    width: 32,
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#0F172A',
                    border: 'none',
                    outline: 'none',
                    bgcolor: 'transparent',
                    p: 0
                  }}
                />
                <IconButton
                  size="small"
                  disabled={line.quantity >= line.stock - otherTabsQty(line.key)}
                  onClick={() => onStep(line.key, 1)}
                  sx={{ p: 0.5 }}
                >
                  <PlusOutlined style={{ fontSize: 10, color: '#475569' }} />
                </IconButton>
              </Box>
              <Typography sx={{ minWidth: 90, textAlign: 'right', fontSize: 13.5, fontWeight: 700, color: '#0F172A', flexShrink: 0 }}>
                {money(line.price * line.quantity)}
              </Typography>
              <IconButton size="small" onClick={() => onRemove(line.key)} sx={{ p: 0.5, color: '#94A3B8', flexShrink: 0 }}>
                <CloseOutlined style={{ fontSize: 11 }} />
              </IconButton>
            </Box>
          ))
        )}
      </Box>
    </Box>
  );
}

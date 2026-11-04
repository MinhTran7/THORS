import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Card,
  Grid,
  Button,
  TextField,
  InputAdornment,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Divider,
  Stack
} from '@mui/material';
import {
  SearchOutlined,
  ClockCircleOutlined,
  CloseOutlined,
  TagsOutlined,
  GiftOutlined
} from '@ant-design/icons';
import { getPromotions } from 'services/promotionService';
import { api } from 'services/http';
import { useCrumbs } from '../../layouts/crumbs';

const C = {
  text: '#202D42',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  surface: '#FFFFFF',
  pink: '#F4A0BC',
  pinkDark: '#BE185D',
  pinkSoft: '#FFF1F5',
  pinkBorder: '#F8B4C8',
  yellow: '#FFF7AE',
  yellowDark: '#713F12',
  yellowSoft: '#FEFCE8',
  yellowBorder: '#FDE047'
};

const money = (val) => {
  if (val == null || val === '') return '0 đ';
  const num = Number(val);
  return Number.isFinite(num) ? `${num.toLocaleString('vi-VN')} đ` : '0 đ';
};

const formatDateTime = (val) => {
  if (!val) return '—';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return '—';
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${hours}:${minutes} ${day}/${month}/${year}`;
};

function VoucherTicket({ promotion, onUse, onViewCondition }) {
  const isPercent = ['PERCENT', 'PERCENTAGE'].includes(promotion.discountType);
  const discountVal = Number(promotion.discountValue);

  const stubBg = isPercent ? C.pinkSoft : C.yellowSoft;
  const stubBorder = isPercent ? C.pinkBorder : C.yellowBorder;
  const mainColor = isPercent ? C.pinkDark : C.yellowDark;
  const btnBg = isPercent ? C.pink : C.yellow;
  const btnText = isPercent ? '#FFFFFF' : C.yellowDark;

  return (
    <Card
      sx={{
        borderRadius: 2.5,
        border: `1px solid ${stubBorder}`,
        bgcolor: C.surface,
        display: 'flex',
        flexDirection: 'row',
        position: 'relative',
        overflow: 'hidden',
        minHeight: 110,
        height: '100%',
        boxShadow: 'none'
      }}
    >
      <Box
        sx={{
          width: { xs: 90, sm: 100 },
          minWidth: { xs: 90, sm: 100 },
          bgcolor: stubBg,
          px: 1,
          py: 1.5,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          position: 'relative',
          borderRight: `1px dashed ${stubBorder}`
        }}
      >
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            bgcolor: '#FFFFFF',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 0.5
          }}
        >
          {isPercent ? (
            <TagsOutlined style={{ fontSize: 14, color: mainColor }} />
          ) : (
            <GiftOutlined style={{ fontSize: 14, color: mainColor }} />
          )}
        </Box>

        <Typography
          sx={{
            fontSize: isPercent ? 18 : 16,
            fontWeight: 800,
            color: mainColor,
            lineHeight: 1.1
          }}
        >
          {isPercent
            ? `${discountVal}%`
            : `${discountVal >= 1000 ? Math.round(discountVal / 1000) + 'K' : discountVal}`}
        </Typography>

        <Typography
          sx={{
            fontSize: 9.5,
            fontWeight: 700,
            color: mainColor,
            textTransform: 'uppercase',
            mt: 0.25
          }}
        >
          {isPercent ? 'GIẢM GIÁ' : 'GIẢM TIỀN'}
        </Typography>

        <Box
          sx={{
            position: 'absolute',
            right: -6,
            top: -6,
            width: 12,
            height: 12,
            bgcolor: '#FAFAF8',
            borderRadius: '50%',
            border: `1px solid ${stubBorder}`,
            zIndex: 2
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            right: -6,
            bottom: -6,
            width: 12,
            height: 12,
            bgcolor: '#FAFAF8',
            borderRadius: '50%',
            border: `1px solid ${stubBorder}`,
            zIndex: 2
          }}
        />
      </Box>

      <Box
        sx={{
          flex: 1,
          px: 1.75,
          py: 1.25,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          minWidth: 0
        }}
      >
        <Box>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: 13.5,
              color: C.text,
              lineHeight: 1.3,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              mb: 0.5
            }}
          >
            {promotion.name}
          </Typography>

          <Typography
            sx={{
              fontSize: 12,
              color: C.muted,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap'
            }}
          >
            Đơn tối thiểu: <strong style={{ color: C.text }}>{money(promotion.minOrderValue)}</strong>
            {isPercent && promotion.maxDiscountAmount && (
              <span> · Tối đa: <strong style={{ color: C.text }}>{money(promotion.maxDiscountAmount)}</strong></span>
            )}
          </Typography>

          <Typography
            sx={{
              fontSize: 11.5,
              color: C.subtle,
              mt: 0.25,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5
            }}
          >
            <ClockCircleOutlined style={{ fontSize: 11 }} />
            <span>HSD: {formatDateTime(promotion.endDate)}</span>
          </Typography>
        </Box>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            pt: 0.75,
            mt: 0.5,
            borderTop: `1px solid ${C.borderLight}`
          }}
        >
          <Button
            size="small"
            onClick={() => onViewCondition(promotion)}
            sx={{
              textTransform: 'none',
              fontSize: 11.5,
              fontWeight: 600,
              color: mainColor,
              p: 0,
              minWidth: 'auto',
              '&:hover': { textDecoration: 'underline', bgcolor: 'transparent' }
            }}
          >
            Điều kiện
          </Button>

          <Button
            variant="contained"
            size="small"
            onClick={() => onUse(promotion)}
            sx={{
              bgcolor: btnBg,
              color: btnText,
              fontWeight: 700,
              fontSize: 11.5,
              borderRadius: 1.5,
              px: 1.75,
              py: 0.35,
              minHeight: 28,
              boxShadow: 'none',
              textTransform: 'none',
              '&:hover': {
                bgcolor: btnBg,
                boxShadow: 'none'
              }
            }}
          >
            Dùng ngay
          </Button>
        </Box>
      </Box>
    </Card>
  );
}

function ConditionDialog({ open, onClose, promotion, onUse }) {
  if (!promotion) return null;

  const isPercent = ['PERCENT', 'PERCENTAGE'].includes(promotion.discountType);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth PaperProps={{ sx: { borderRadius: 2.5, p: 1 } }}>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Typography sx={{ fontWeight: 700, fontSize: 16, color: C.text }}>
          Chi tiết chương trình ưu đãi
        </Typography>
        <IconButton size="small" onClick={onClose}>
          <CloseOutlined style={{ fontSize: 14, color: C.muted }} />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers sx={{ borderColor: C.borderLight }}>
        <Stack spacing={2}>
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: 14.5, color: C.text }}>
              {promotion.name}
            </Typography>
            {promotion.description && (
              <Typography sx={{ mt: 0.5, fontSize: 13, color: C.muted }}>
                {promotion.description}
              </Typography>
            )}
          </Box>

          <Divider />

          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
            <Box>
              <Typography sx={{ fontSize: 12, color: C.muted }}>Mức giảm giá</Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: isPercent ? C.pinkDark : C.yellowDark, mt: 0.25 }}>
                {isPercent ? `${promotion.discountValue}%` : money(promotion.discountValue)}
              </Typography>
            </Box>

            <Box>
              <Typography sx={{ fontSize: 12, color: C.muted }}>Đơn hàng tối thiểu</Typography>
              <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text, mt: 0.25 }}>
                {money(promotion.minOrderValue)}
              </Typography>
            </Box>

            {isPercent && promotion.maxDiscountAmount && (
              <Box>
                <Typography sx={{ fontSize: 12, color: C.muted }}>Số tiền giảm tối đa</Typography>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text, mt: 0.25 }}>
                  {money(promotion.maxDiscountAmount)}
                </Typography>
              </Box>
            )}

            {promotion.usageLimit && (
              <Box>
                <Typography sx={{ fontSize: 12, color: C.muted }}>Giới hạn lượt dùng</Typography>
                <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text, mt: 0.25 }}>
                  {promotion.usageLimit} lượt
                </Typography>
              </Box>
            )}

            <Box sx={{ gridColumn: 'span 2' }}>
              <Typography sx={{ fontSize: 12, color: C.muted }}>Thời gian áp dụng</Typography>
              <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text, mt: 0.25 }}>
                Từ {formatDateTime(promotion.startDate)} đến {formatDateTime(promotion.endDate)}
              </Typography>
            </Box>

            <Box sx={{ gridColumn: 'span 2' }}>
              <Typography sx={{ fontSize: 12, color: C.muted }}>Sản phẩm áp dụng</Typography>
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mt: 0.25 }}>
                {promotion.applyScope === 'ALL'
                  ? 'Áp dụng cho toàn bộ sản phẩm trong cửa hàng'
                  : 'Chỉ áp dụng cho một số sản phẩm thuộc chương trình'}
              </Typography>
            </Box>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions sx={{ px: 2, py: 1.5 }}>
        <Button
          variant="contained"
          fullWidth
          onClick={() => {
            onClose();
            onUse(promotion);
          }}
          sx={{
            bgcolor: C.pink,
            color: '#FFFFFF',
            fontWeight: 700,
            borderRadius: 2,
            py: 0.8,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': { bgcolor: C.pink, boxShadow: 'none' }
          }}
        >
          Áp dụng và mua sắm ngay
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function CustomerPromotionPage() {
  const navigate = useNavigate();
  useCrumbs(['Kho voucher & Khuyến mãi']);

  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedPromo, setSelectedPromo] = useState(null);

  useEffect(() => {
    let active = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const promoRes = await getPromotions();
        if (!active) return;
        const promoList = Array.isArray(promoRes) ? promoRes : promoRes?.data || [];
        setPromotions(promoList);
      } catch (err) {
        console.error('Lỗi tải danh sách khuyến mãi:', err);
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchData();
    return () => {
      active = false;
    };
  }, []);

  const filteredPromotions = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return promotions;
    return promotions.filter(
      (p) => p.name?.toLowerCase().includes(kw) || p.description?.toLowerCase().includes(kw)
    );
  }, [promotions, search]);

  const handleUse = useCallback((promo) => {
    try {
      sessionStorage.setItem('thors:applied_voucher', JSON.stringify(promo));
    } catch {}
    api('/cart')
      .then((cartData) => {
        if (cartData?.items?.length > 0) {
          navigate('/cart');
        } else {
          navigate('/');
        }
      })
      .catch(() => {
        navigate('/');
      });
  }, [navigate]);

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto', pb: 8, color: C.text }}>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, fontSize: { xs: 22, sm: 26 }, color: C.text, mb: 0.5 }}>
          Kho Voucher & Khuyến Mãi
        </Typography>
        <Typography sx={{ fontSize: 13.5, color: C.muted }}>
          Thu thập mã giảm giá và ưu đãi hấp dẫn để tiết kiệm khi mua sắm tại THORS.
        </Typography>
      </Box>

      <Box sx={{ mb: 3 }}>
        <TextField
          size="small"
          placeholder="Tìm mã hoặc tên ưu đãi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined style={{ color: C.subtle, fontSize: 16 }} />
              </InputAdornment>
            )
          }}
          sx={{
            width: { xs: '100%', sm: 320 },
            '& .MuiOutlinedInput-root': {
              borderRadius: 2,
              bgcolor: '#FFFFFF',
              fontSize: 13.5,
              '& fieldset': { borderColor: C.border },
              '&:hover fieldset': { borderColor: C.pink },
              '&.Mui-focused fieldset': { borderColor: C.pink }
            }
          }}
        />
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: C.pink }} />
        </Box>
      ) : filteredPromotions.length === 0 ? (
        <Card
          sx={{
            p: 5,
            textAlign: 'center',
            borderRadius: 2.5,
            border: `1px solid ${C.border}`,
            bgcolor: '#FFFFFF',
            boxShadow: 'none'
          }}
        >
          <Typography sx={{ fontWeight: 600, fontSize: 14.5, color: C.text, mb: 0.5 }}>
            Không tìm thấy chương trình khuyến mãi nào
          </Typography>
          <Typography sx={{ fontSize: 13, color: C.muted, maxWidth: 400, mx: 'auto', mb: 2 }}>
            {search ? 'Không có voucher nào khớp với từ khóa tìm kiếm của bạn.' : 'Hiện tại chưa có ưu đãi nào.'}
          </Typography>
          {search && (
            <Button
              variant="outlined"
              size="small"
              onClick={() => setSearch('')}
              sx={{
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
                fontSize: 12.5,
                borderColor: C.border,
                color: C.text
              }}
            >
              Xóa tìm kiếm
            </Button>
          )}
        </Card>
      ) : (
        <Grid container spacing={2}>
          {filteredPromotions.map((promo) => (
            <Grid item xs={12} sm={6} lg={4} key={promo.promotionId}>
              <VoucherTicket
                promotion={promo}
                onUse={handleUse}
                onViewCondition={(p) => setSelectedPromo(p)}
              />
            </Grid>
          ))}
        </Grid>
      )}

      {Boolean(selectedPromo) && (
        <ConditionDialog
          open={Boolean(selectedPromo)}
          onClose={() => setSelectedPromo(null)}
          promotion={selectedPromo}
          onUse={handleUse}
        />
      )}
    </Box>
  );
}

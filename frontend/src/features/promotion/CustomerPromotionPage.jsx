import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, Dialog, IconButton, InputAdornment, Tab, Tabs, TextField } from '@mui/material';
import { SearchOutlined, CloseOutlined } from '@ant-design/icons';
import { getPromotions } from 'services/promotionService';
import { api } from 'services/http';
import { useCrumbs } from '../../layouts/crumbs';
import { StoreAccountShell } from 'features/account/components/StoreAccount';
import { C, RADIUS, SANS } from 'features/shop/storeTheme';
import { primaryButtonSx } from 'features/customer/theme';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const WARN = '#8A5A00';

const TABS = [
  ['ALL', 'Tất cả'],
  ['PERCENT', 'Giảm theo %'],
  ['AMOUNT', 'Giảm tiền'],
  ['EXPIRING', 'Sắp hết hạn']
];

const isPercent = (p) => ['PERCENT', 'PERCENTAGE'].includes(p.discountType);

const money = (val) => `${(Number(val) || 0).toLocaleString('vi-VN')} đ`;

const pad = (n) => String(n).padStart(2, '0');

const formatDate = (val) => {
  const d = new Date(val);
  return val && !Number.isNaN(d.getTime()) ? `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}` : '—';
};

const formatDateTime = (val) => {
  const d = new Date(val);
  return val && !Number.isNaN(d.getTime()) ? `${pad(d.getHours())}:${pad(d.getMinutes())} ${formatDate(val)}` : '—';
};

const timeLeft = (end) => {
  const ms = new Date(end) - Date.now();
  if (!(ms > 0) || ms > 3 * DAY) return null;
  return ms >= DAY ? `Còn ${Math.floor(ms / DAY)} ngày` : `Còn ${Math.max(1, Math.floor(ms / HOUR))} giờ`;
};

const matchTab = (p, tab) =>
  tab === 'ALL' ||
  (tab === 'PERCENT' && isPercent(p)) ||
  (tab === 'AMOUNT' && !isPercent(p)) ||
  (tab === 'EXPIRING' && Boolean(timeLeft(p.endDate)));

const discountParts = (p) => {
  const v = Number(p.discountValue) || 0;
  if (isPercent(p)) return [v, '%'];
  return v >= 1000 ? [Math.round(v / 1000), 'K'] : [v, 'đ'];
};

// Theo màu chung của màn khách (storeTheme)
const CYAN = C.cyan;
const CYAN_HOVER = C.accent;

const noClickFx = { '&::after': { display: 'none !important' } };

const cyanBtnSx = {
  ...noClickFx,
  bgcolor: `${CYAN} !important`,
  color: `${C.cyanInk} !important`,
  boxShadow: 'none !important',
  '&:hover': { bgcolor: `${CYAN_HOVER} !important`, color: `${C.cyanInk} !important` }
};

const ticketBtnSx = { ...cyanBtnSx, px: 2, height: 38, fontSize: 12 };

const notch = (x, y) => `radial-gradient(circle at ${x} ${y}, #0000 10px, #000 10.5px) ${x} ${y} / 20px 50% no-repeat`;
const teeth = (x) => `radial-gradient(circle at ${x} 50%, #0000 5px, #000 5.5px) ${x} 0 / 8px 14px repeat-y`;
const solid = (x, w) => `linear-gradient(#000 0 0) ${x} 0 / calc(100% - ${w}px) 100% no-repeat`;
const maskSx = (...layers) => ({ WebkitMask: layers.join(','), mask: layers.join(',') });

function VoucherTicket({ promotion, onUse, onViewCondition }) {
  const [value, unit] = discountParts(promotion);
  const left = timeLeft(promotion.endDate);

  return (
    <Box sx={{ display: 'flex', minHeight: 160, filter: 'drop-shadow(0 14px 18px rgba(31,41,55,.08)) drop-shadow(0 0 1px rgba(160,140,90,.55))' }}>
      <Box
        sx={{
          flex: 1,
          minWidth: 0,
          bgcolor: '#FFFFFF',
          p: '18px 18px 14px 26px',
          display: 'flex',
          flexDirection: 'column',
          ...maskSx(solid('8px', 28), teeth('0'), notch('100%', '0'), notch('100%', '100%'))
        }}
      >
        <Box component="h3" sx={{ m: 0, fontSize: 15, fontWeight: 700, lineHeight: 1.35 }}>
          {promotion.name}
        </Box>
        <Box sx={{ fontSize: 12.5, color: C.muted, mt: 0.5, lineHeight: 1.5, '& b': { color: C.ink, fontWeight: 600 } }}>
          Đơn tối thiểu <b>{money(promotion.minOrderValue)}</b>
          {isPercent(promotion) && promotion.maxDiscountAmount && (
            <>
              <br />
              Giảm tối đa <b>{money(promotion.maxDiscountAmount)}</b>
            </>
          )}
        </Box>
        <Box sx={{ fontSize: 12.5, mt: 0.75, color: left ? WARN : C.muted, fontWeight: left ? 600 : 400 }}>
          {left || `HSD ${formatDate(promotion.endDate)}`}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 'auto', pt: 1.5 }}>
          <Button variant="text" disableRipple onClick={() => onViewCondition(promotion)} sx={{ ...noClickFx, fontSize: 12.5, minWidth: 0, px: 0, color: `${CYAN_HOVER} !important`, '&:hover': { bgcolor: 'transparent' } }}>
            Điều kiện
          </Button>
          <Button variant="contained" disableRipple onClick={() => onUse(promotion)} sx={ticketBtnSx}>
            DÙNG NGAY
          </Button>
        </Box>
      </Box>

      <Box
        sx={{
          width: 104,
          flexShrink: 0,
          bgcolor: C.sand,
          borderLeft: '2px dashed #E7CF8A',
          pr: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          ...maskSx(solid('20px', 28), teeth('100%'), notch('0', '0'), notch('0', '100%'))
        }}
      >
        <Box sx={{ fontSize: 28, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
          {value}
          {unit}
        </Box>
        <Box sx={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', color: C.muted, mt: 0.75 }}>
          {isPercent(promotion) ? 'GIẢM GIÁ' : 'GIẢM TIỀN'}
        </Box>
      </Box>
    </Box>
  );
}

function ConditionDialog({ promotion, onClose, onUse }) {
  const [value, unit] = discountParts(promotion);
  const rows = [
    ['Đơn tối thiểu', Number(promotion.minOrderValue) > 0 ? money(promotion.minOrderValue) : 'Không yêu cầu'],
    isPercent(promotion) && promotion.maxDiscountAmount && ['Giảm tối đa', money(promotion.maxDiscountAmount)],
    ['Bắt đầu', formatDateTime(promotion.startDate)],
    ['Kết thúc', formatDateTime(promotion.endDate)],
    ['Sản phẩm áp dụng', promotion.applyScope === 'ALL' ? 'Toàn bộ cửa hàng' : 'Một số sản phẩm']
  ].filter(Boolean);

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth="xs"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: RADIUS.card, overflowY: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' }, color: C.ink, fontFamily: SANS } } }}
    >
      <Box sx={{ position: 'relative', bgcolor: C.sand, textAlign: 'center', p: '32px 28px 24px' }}>
        <IconButton onClick={onClose} sx={{ position: 'absolute', top: 14, right: 14, width: 34, height: 34, bgcolor: '#FFFFFF', '&:hover': { bgcolor: '#FFFFFF' } }}>
          <CloseOutlined style={{ fontSize: 12, color: C.muted }} />
        </IconButton>
        <Box sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', color: C.muted }}>{isPercent(promotion) ? 'GIẢM GIÁ' : 'GIẢM TIỀN'}</Box>
        <Box sx={{ fontSize: 56, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1.1 }}>
          {value}
          {unit}
        </Box>
        <Box component="h2" sx={{ m: 0, mt: 0.5, fontSize: 18, fontWeight: 700 }}>
          {promotion.name}
        </Box>
        {promotion.description && <Box sx={{ mt: 0.75, fontSize: 13.5, color: C.muted, lineHeight: 1.5 }}>{promotion.description}</Box>}
      </Box>

      <Box sx={{ borderTop: '2px dashed #E7CF8A' }} />

      <Box sx={{ p: '8px 28px 28px' }}>
        {rows.map(([label, val], i) => (
          <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, py: 1.5, borderTop: i ? `1px solid ${C.line}` : 0, fontSize: 14 }}>
            <Box component="span" sx={{ color: C.muted }}>
              {label}
            </Box>
            <Box component="span" sx={{ fontWeight: 600, textAlign: 'right' }}>
              {val}
            </Box>
          </Box>
        ))}

        <Button
          fullWidth
          disableRipple
          onClick={() => {
            onClose();
            onUse(promotion);
          }}
          sx={{ ...primaryButtonSx, ...cyanBtnSx, mt: 2, height: 50, fontSize: 14 }}
        >
          ÁP DỤNG VÀ MUA SẮM NGAY
        </Button>
      </Box>
    </Dialog>
  );
}

export default function CustomerPromotionPage() {
  const navigate = useNavigate();
  useCrumbs(['Kho voucher & Khuyến mãi']);

  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('ALL');
  const [selectedPromo, setSelectedPromo] = useState(null);

  useEffect(() => {
    let active = true;
    getPromotions()
      .then((res) => active && setPromotions(Array.isArray(res) ? res : res?.data || []))
      .catch((err) => console.error('Lỗi tải danh sách khuyến mãi:', err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const searched = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return promotions;
    return promotions.filter((p) => p.name?.toLowerCase().includes(kw) || p.description?.toLowerCase().includes(kw));
  }, [promotions, search]);

  const shown = searched.filter((p) => matchTab(p, tab));

  const handleUse = useCallback(
    (promo) => {
      try {
        sessionStorage.setItem('thors:applied_voucher', JSON.stringify(promo));
      } catch {}
      if (promo.applyScope === 'SELECTED') {
        navigate(`/promotions/${promo.promotionId}/products`);
      } else {
        navigate('/');
      }
    },
    [navigate]
  );

  return (
    <StoreAccountShell title="Kho khuyến mãi" subtitle="Khám phá nhiều ưu đãi cùng THORS">
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 2, borderBottom: `1px solid ${C.line}`, mb: 3.5 }}>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            minHeight: 48,
            minWidth: 0,
            '& .MuiTabs-indicator': { bgcolor: CYAN, height: 3, borderRadius: '3px' },
            '& .MuiTab-root': {
              minHeight: 48,
              minWidth: 0,
              px: { xs: 1.5, sm: 2.25 },
              textTransform: 'none',
              fontWeight: 500,
              fontSize: 14,
              color: C.muted,
              '&.Mui-selected': { color: C.ink, fontWeight: 600 }
            }
          }}
        >
          {TABS.map(([value, label]) => (
            <Tab
              key={value}
              value={value}
              label={
                <span>
                  {label}
                  <Box component="span" sx={{ ml: 0.75, fontSize: 12, color: '#9CA3AF' }}>
                    {searched.filter((p) => matchTab(p, value)).length}
                  </Box>
                </span>
              }
            />
          ))}
        </Tabs>

        <TextField
          placeholder="Tìm theo tên ưu đãi..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchOutlined style={{ color: '#9CA3AF', fontSize: 16 }} />
              </InputAdornment>
            )
          }}
          size="small"
          sx={{ width: { xs: '100%', sm: 280 }, mb: { xs: 1.5, sm: 0 } }}
        />
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} sx={{ color: C.teal }} />
        </Box>
      ) : shown.length === 0 ? (
        <Box sx={{ bgcolor: C.sand, py: { xs: 8, sm: 9 }, px: 2, textAlign: 'center' }}>
          <Box component="h2" sx={{ m: 0, fontSize: { xs: 26, sm: 30 } }}>
            {search ? 'Không tìm thấy ưu đãi nào' : 'Hiện chưa có ưu đãi nào'}
          </Box>
          <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 15, color: C.muted, maxWidth: 420, mx: 'auto', lineHeight: 1.6 }}>
            {search ? 'Không có voucher nào khớp với từ khóa của bạn. Thử từ khóa khác hoặc chọn tab khác.' : 'Quay lại sau để nhận thêm ưu đãi mới nhé.'}
          </Box>
          {search && (
            <Button variant="outlined" onClick={() => setSearch('')} sx={{ mt: 3.5, height: 44, px: 2.5 }}>
              XÓA TÌM KIẾM
            </Button>
          )}
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr', lg: 'repeat(3, 1fr)' }, gap: 3 }}>
          {shown.map((promo) => (
            <VoucherTicket key={promo.promotionId} promotion={promo} onUse={handleUse} onViewCondition={setSelectedPromo} />
          ))}
        </Box>
      )}

      {selectedPromo && <ConditionDialog promotion={selectedPromo} onClose={() => setSelectedPromo(null)} onUse={handleUse} />}
    </StoreAccountShell>
  );
}

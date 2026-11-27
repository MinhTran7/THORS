import { useMemo, useState } from 'react';
import { Box, Button, CircularProgress, InputAdornment, Tab, Tabs, TextField } from '@mui/material';
import { SearchOutlined } from '@ant-design/icons';
import { StoreAccountShell } from 'features/account/components/StoreAccount';
import { C } from 'features/shop/storeTheme';
import { useCrumbs } from 'layouts/crumbs';
import { ConditionDialog, isUpcoming, STUB_BG, timeLeft, VoucherTicket } from '../components/VoucherTicket';
import { useVouchers } from '../hooks';

const TABS = [
  ['ALL', 'Tất cả'],
  ['ONGOING', 'Đang diễn ra'],
  ['EXPIRING', 'Sắp hết hạn'],
  ['UPCOMING', 'Sắp diễn ra']
];

const matchTab = (p, tab) =>
  tab === 'ALL' ||
  (tab === 'ONGOING' && !isUpcoming(p)) ||
  (tab === 'EXPIRING' && !isUpcoming(p) && Boolean(timeLeft(p.endDate))) ||
  (tab === 'UPCOMING' && isUpcoming(p));

// Kho voucher của khách: mã giảm giá online còn dùng được
export default function VoucherWalletPage() {
  useCrumbs(['Kho voucher']);

  const { vouchers: promotions, loading } = useVouchers();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('ALL');
  const [selectedPromo, setSelectedPromo] = useState(null);

  const searched = useMemo(() => {
    const kw = search.trim().toLowerCase();
    if (!kw) return promotions;
    return promotions.filter((p) => p.name?.toLowerCase().includes(kw) || p.description?.toLowerCase().includes(kw));
  }, [promotions, search]);

  const shown = searched.filter((p) => matchTab(p, tab));

  return (
    <StoreAccountShell title="Kho voucher" subtitle="Voucher giảm giá cho đơn hàng của bạn">
      <Box
        sx={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 2,
          borderBottom: `1px solid ${C.line}`,
          mb: 3.5
        }}
      >
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            minHeight: 48,
            minWidth: 0,
            '& .MuiTabs-indicator': { bgcolor: C.cyan, height: 3, borderRadius: '3px' },
            '& .MuiTab-root': {
              minHeight: 48,
              minWidth: 0,
              px: { xs: 1.5, sm: 2.25 },
              textTransform: 'none',
              fontWeight: 500,
              fontSize: 14,
              color: C.muted,
              '&:hover': { bgcolor: STUB_BG, color: C.ink },
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
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: '#9CA3AF', fontSize: 16 }} />
                </InputAdornment>
              )
            }
          }}
          size="small"
          sx={{
            width: { xs: '100%', sm: 280 },
            mb: { xs: 1.5, sm: 0 },
            '& .MuiOutlinedInput-root': { borderRadius: '0 !important', boxShadow: 'none !important' },
            '& fieldset': { borderColor: `${C.line} !important` }
          }}
        />
      </Box>

      <Box sx={{ minHeight: { xs: 'calc(100vh - 420px)', md: 'calc(100vh - 470px)' } }}>
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
              {search
                ? 'Không có voucher nào khớp với từ khóa của bạn. Thử từ khóa khác hoặc chọn tab khác.'
                : 'Quay lại sau để nhận thêm ưu đãi mới nhé.'}
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
              <VoucherTicket key={promo.promotionId} promotion={promo} onViewCondition={setSelectedPromo} />
            ))}
          </Box>
        )}
      </Box>

      {selectedPromo && <ConditionDialog promotion={selectedPromo} onClose={() => setSelectedPromo(null)} />}
    </StoreAccountShell>
  );
}

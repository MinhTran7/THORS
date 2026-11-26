import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Button, CircularProgress, InputAdornment, MenuItem, Select, TextField, Typography } from '@mui/material';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { FilterResetButton, Pager } from 'features/account/components/Blocks';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { pageTitleSx } from 'themes/pageType';
import { ActionDialogs, ErrorToast } from '../components/PromotionDialogs';
import PromotionTable from '../components/PromotionTable';
import { usePromotionActions, usePromotions } from '../hooks';
import { C, filterInputSx, primaryButtonSx } from '../theme';
import { isRunning, KIND } from '../utils';
import VoucherWalletPage from './VoucherWalletPage';

const PAGE_SIZE = 8;
const SCHEDULES = [
  ['ALL', 'Tất cả'],
  ['ONGOING', 'Đang diễn ra'],
  ['UPCOMING', 'Sắp diễn ra'],
  ['ENDED', 'Đã kết thúc']
];
const STATUSES = [
  ['ALL', 'Tất cả'],
  ['ACTIVE', 'Đang bật'],
  ['INACTIVE', 'Đang tắt']
];
const NO_FILTER = { search: '', schedule: 'ALL', status: 'ALL' };

function Filter({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>{label}</Typography>
      {children}
    </Box>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <Filter label={label}>
      <Select fullWidth size="small" value={value} onChange={(e) => onChange(e.target.value)} sx={filterInputSx}>
        {options.map(([key, text]) => (
          <MenuItem key={key} value={key}>
            {text}
          </MenuItem>
        ))}
      </Select>
    </Filter>
  );
}

const matches = (p, { search, schedule, status }) =>
  p.name.toLocaleLowerCase('vi-VN').includes(search.trim().toLocaleLowerCase('vi-VN')) &&
  (schedule === 'ALL' || p.schedule === schedule) &&
  (status === 'ALL' || (status === 'ACTIVE') === isRunning(p));

// Danh sách khuyến mãi của Owner, lọc và phân trang phía trình duyệt
function OwnerPromotionList({ kind }) {
  const { base, title, name } = KIND[kind];
  useCrumbs([title]);
  const navigate = useNavigate();
  const { promotions, loading, error, clearError, reload } = usePromotions(kind);
  const actions = usePromotionActions(reload);
  const [filter, setFilter] = useState(NO_FILTER);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => promotions.filter((p) => matches(p, filter)), [promotions, filter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const changeFilter = (patch) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  return (
    <Box sx={{ color: C.text, pb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Typography variant="h3" sx={pageTitleSx}>
          {title}
        </Typography>
        <Button variant="contained" startIcon={<PlusOutlined />} onClick={() => navigate(`${base}/add`)} sx={primaryButtonSx}>
          Thêm {name}
        </Button>
      </Box>

      <ErrorToast message={error} onClose={clearError} />

      <Box
        sx={{
          mb: 3,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            lg: 'minmax(200px, 1.8fr) minmax(150px, 180px) minmax(150px, 180px) auto'
          },
          gap: { xs: 1.5, lg: 2 },
          alignItems: 'flex-end'
        }}
      >
        <Filter label="Tìm kiếm khuyến mãi">
          <TextField
            fullWidth
            size="small"
            placeholder="Tìm theo tên khuyến mãi..."
            value={filter.search}
            onChange={(e) => changeFilter({ search: e.target.value })}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: C.subtle, fontSize: 16 }} />
                  </InputAdornment>
                )
              }
            }}
            sx={{ '& .MuiOutlinedInput-root': filterInputSx }}
          />
        </Filter>
        <FilterSelect label="Thời gian" value={filter.schedule} options={SCHEDULES} onChange={(schedule) => changeFilter({ schedule })} />
        <FilterSelect label="Trạng thái" value={filter.status} options={STATUSES} onChange={(status) => changeFilter({ status })} />
        <FilterResetButton onClick={() => changeFilter(NO_FILTER)} />
      </Box>

      <Box sx={{ bgcolor: C.surface, borderRadius: 3.5, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ py: 8, textAlign: 'center' }}>
            <CircularProgress size={36} sx={{ color: C.cyan }} />
            <Typography sx={{ mt: 2, fontSize: 13.5, color: C.muted }}>Đang tải danh sách khuyến mãi...</Typography>
          </Box>
        ) : (
          <>
            <PromotionTable
              kind={kind}
              rows={filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)}
              startIndex={(current - 1) * PAGE_SIZE}
              actions={actions}
              onView={(p) => navigate(`${base}/${p.promotionId}`)}
            />
            <Pager
              page={current - 1}
              totalPages={pageCount}
              total={filtered.length}
              size={PAGE_SIZE}
              noun="khuyến mãi"
              onPage={(p) => setPage(p + 1)}
              sx={{ borderTop: `1px solid ${C.borderLight}` }}
            />
          </>
        )}
      </Box>

      <ActionDialogs {...actions.dialogs} />
    </Box>
  );
}

// /promotions: khách xem Kho voucher, Owner quản lý khuyến mãi
export default function PromotionPage({ kind = 'PRODUCT' }) {
  const { account } = useAuth();
  if (account?.role === 'CUSTOMER') return <VoucherWalletPage />;
  return <OwnerPromotionList key={kind} kind={kind} />;
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { FilterResetButton, Pager } from 'features/account/components/Blocks';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined, StopOutlined } from '@ant-design/icons';
import { getPromotions } from 'services/promotionService';
import { useAuth } from 'features/auth/AuthProvider';
import CustomerPromotionPage from './CustomerPromotionPage';
import { ConfirmDialog, NoticeDialog } from './PromotionForm';
import { deleteAction, endEarlyAction, toggleAction } from './promotionActions';
import { PAGE_TYPE, pageTitleSx } from 'themes/pageType';
import { useCrumbs } from '../../layouts/crumbs';
import {
  discountText,
  editBlockedMessage,
  formatDateTime,
  KIND,
  kindOf,
  money,
  SCHEDULE_LABEL
} from './promotionFormat';

const C = {
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cream: '#FFF7AE',
  creamText: '#713F12'
};

const PAGE_SIZE = 8;

const isPromotionActive = (promotion) => promotion.schedule !== 'ENDED' && promotion.status === 'ACTIVE';

function PromotionSwitch({ promotion, onToggle, disabled }) {
  const isEnded = promotion.schedule === 'ENDED';
  const active = isPromotionActive(promotion);

  return (
    <Stack direction="row" spacing={1.25} sx={{ pt: 0.5, alignItems: 'center' }}>
      <Switch
        checked={active}
        disabled={disabled}
        onChange={() => onToggle(promotion)}
        size="small"
        sx={{
          width: 34,
          height: 18,
          p: 0,
          '& .MuiSwitch-switchBase': {
            p: '2px',
            transitionDuration: '200ms',
            '&.Mui-checked': {
              transform: 'translateX(16px)',
              color: '#67E8F9',
              '& + .MuiSwitch-track': {
                bgcolor: '#BAF2F8',
                opacity: 1,
                border: 0
              }
            }
          },
          '& .MuiSwitch-thumb': {
            boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            width: 14,
            height: 14
          },
          '& .MuiSwitch-track': {
            borderRadius: 9,
            bgcolor: '#CBD5E1',
            opacity: 1
          }
        }}
      />
      <Box
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          px: 1.5,
          py: 0.35,
          borderRadius: 1.75,
          fontSize: 13,
          fontWeight: 600,
          bgcolor: active ? '#E7F6F1' : '#F0F2F4',
          color: active ? '#168B70' : '#75869F'
        }}
      >
        {isEnded ? 'Đã kết thúc' : active ? 'Đang bật' : 'Đang tắt'}
      </Box>
    </Stack>
  );
}

function FilterSelect({ label, value, onChange, options }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>{label}</Typography>
      <Select
        fullWidth
        size="small"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        sx={{
          bgcolor: C.surface,
          borderRadius: 2.5,
          height: 44,
          fontSize: 13.5,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan }
        }}
      >
        {options.map(([key, text]) => (
          <MenuItem key={key} value={key}>
            {text}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );
}

function UsageBar({ promotion }) {
  const used = Number(promotion.usedCount || 0);
  const limit = Number(promotion.usageLimit || 0);
  const percent = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <Box sx={{ maxWidth: 170 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>{limit ? `${used}/${limit} lượt` : `${used} lượt`}</Typography>
        {limit > 0 && <Typography sx={{ fontSize: 11.5, color: C.muted }}>{Math.round(percent)}%</Typography>}
      </Box>
      <Box sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: '#E2E8F0', overflow: 'hidden' }}>
        <Box
          sx={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: 3,
            bgcolor: percent >= 100 ? '#EF4444' : percent >= 80 ? '#F59E0B' : '#67E8F9'
          }}
        />
      </Box>
      {!limit && <Typography sx={{ fontSize: 11.5, color: '#94A3B8', mt: 0.5 }}>Chưa đặt giới hạn</Typography>}
    </Box>
  );
}

function OwnerPromotionView({ kind }) {
  const { base, title, name } = KIND[kind];
  useCrumbs([title]);

  const navigate = useNavigate();
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState('ALL');
  const [enableFilter, setEnableFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  // confirm: { promotion, title, message, warning, run } cho bật/tắt, kết thúc sớm, xóa
  const [confirm, setConfirm] = useState(null);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');

  // Quyền thao tác lấy từ backend (canEnable, canDisable, canEdit, canAdjust...)
  const toggleStatus = (promotion) => {
    const action = toggleAction(promotion);
    if (typeof action === 'string') setNotice(action);
    else setConfirm(action);
  };

  const openEdit = (promotion) => {
    if (promotion.canEdit || promotion.canAdjust) navigate(`${base}/${promotion.promotionId}/edit`);
    else setNotice(editBlockedMessage(promotion));
  };

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    try {
      setPromotions(await getPromotions());
      setError('');
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách khuyến mãi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  const filteredPromotions = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi-VN');
    return promotions.filter((promotion) => {
      const matchesSearch = (promotion.name || '').toLocaleLowerCase('vi-VN').includes(keyword);
      const matchesSchedule = scheduleFilter === 'ALL' || promotion.schedule === scheduleFilter;
      const matchesEnable =
        enableFilter === 'ALL' ||
        (enableFilter === 'ACTIVE' && isPromotionActive(promotion)) ||
        (enableFilter === 'INACTIVE' && !isPromotionActive(promotion));
      return kindOf(promotion) === kind && matchesSearch && matchesSchedule && matchesEnable;
    });
  }, [promotions, kind, search, scheduleFilter, enableFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredPromotions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filteredPromotions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const runConfirm = async () => {
    if (!confirm || working) return;
    setWorking(true);
    try {
      await confirm.run();
      setConfirm(null);
      await loadPromotions();
    } catch (err) {
      setError(err.message || 'Không thể thực hiện thao tác.');
    } finally {
      setWorking(false);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setScheduleFilter('ALL');
    setEnableFilter('ALL');
    setPage(1);
  };

  return (
    <Box sx={{ color: C.text, pb: 4 }}>
      {/* ─── TIÊU ĐỀ TRÊN CÙNG: DANH SÁCH KHUYẾN MÃI ─── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Typography variant="h3" sx={{ ...pageTitleSx, color: C.text }}>
          {title}
        </Typography>
        <Button
          variant="contained"
          startIcon={<PlusOutlined />}
          onClick={() => navigate(`${base}/add`)}
          sx={{
            bgcolor: C.cyan,
            color: C.text,
            fontWeight: 700,
            fontSize: 13.5,
            borderRadius: 2.5,
            height: 44,
            px: 2.5,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': { bgcolor: C.cyanHover, boxShadow: 'none' }
          }}
        >
          Thêm {name}
        </Button>
      </Box>

      {/* ─── TOAST THÔNG BÁO GÓC MÀN HÌNH (TỰ MẤT SAU 5 GIÂY) ─── */}
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={5000}
        onClose={() => setError('')}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ mt: 7 }}
      >
        <Alert
          severity="error"
          onClose={() => setError('')}
          sx={{
            width: '100%',
            maxWidth: 300,
            minHeight: 76,
            py: 1.75,
            px: 2,
            bgcolor: '#FFFFFF',
            color: '#1E293B',
            borderRadius: 1.5,
            border: '1px solid #E2E8F0',
            borderLeft: '5px solid #EF4444',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
            fontWeight: 600,
            fontSize: 13,
            alignItems: 'flex-start',
            '& .MuiAlert-icon': {
              color: '#EF4444',
              fontSize: 20,
              mt: 0.25,
              mr: 1.25
            },
            '& .MuiAlert-message': {
              color: '#1E293B',
              p: 0,
              lineHeight: 1.5
            },
            '& .MuiAlert-action': {
              color: '#64748B',
              p: 0,
              mt: -0.25,
              ml: 1
            }
          }}
        >
          {error}
        </Alert>
      </Snackbar>

      {/* ─── THANH BỘ LỌC PHÍA TRÊN ─── */}
      <Box
        sx={{
          mb: 3,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, minmax(0, 1fr))',
            // Chỉ dàn 1 hàng khi đủ chỗ (lg) để không tràn ngang
            lg: 'minmax(200px, 1.8fr) minmax(150px, 180px) minmax(150px, 180px) auto'
          },
          gap: { xs: 1.5, lg: 2 },
          alignItems: 'flex-end'
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>Tìm kiếm khuyến mãi</Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Tìm theo tên khuyến mãi..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                  </InputAdornment>
                )
              }
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: C.surface,
                borderRadius: 2.5,
                height: 44,
                fontSize: 13.5,
                '& fieldset': { borderColor: C.border },
                '&:hover fieldset': { borderColor: C.cyan },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          />
        </Box>

        <FilterSelect
          label="Thời gian"
          value={scheduleFilter}
          onChange={(value) => {
            setScheduleFilter(value);
            setPage(1);
          }}
          options={[
            ['ALL', 'Tất cả'],
            ['ONGOING', 'Đang diễn ra'],
            ['UPCOMING', 'Sắp diễn ra'],
            ['ENDED', 'Đã kết thúc']
          ]}
        />
        <FilterSelect
          label="Trạng thái"
          value={enableFilter}
          onChange={(value) => {
            setEnableFilter(value);
            setPage(1);
          }}
          options={[
            ['ALL', 'Tất cả'],
            ['ACTIVE', 'Đang bật'],
            ['INACTIVE', 'Đang tắt']
          ]}
        />

        <FilterResetButton onClick={handleResetFilters} />
      </Box>

      {/* ─── KHỐI BẢNG DANH SÁCH KHUYẾN MÃI ─── */}
      <Box
        sx={{
          bgcolor: C.surface,
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden'
        }}
      >
        {loading ? (
          <Box sx={{ py: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <CircularProgress size={36} sx={{ color: C.cyan }} />
            <Typography sx={{ mt: 2, fontSize: 13.5, color: C.muted }}>Đang tải danh sách khuyến mãi...</Typography>
          </Box>
        ) : (
          <>
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table
                sx={{
                  minWidth: 1100,
                  tableLayout: 'fixed',
                  '& th': {
                    bgcolor: C.surface,
                    color: C.muted,
                    fontSize: PAGE_TYPE.th,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    py: 1.75,
                    borderBottom: `1px solid ${C.borderLight}`
                  },
                  '& td': {
                    borderColor: C.borderLight,
                    py: 2,
                    fontSize: PAGE_TYPE.td,
                    color: C.text
                  }
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell align="center" sx={{ pl: 3, width: '5%' }}>
                      STT
                    </TableCell>
                    <TableCell sx={{ width: '14%' }}>TÊN KHUYẾN MÃI</TableCell>
                    <TableCell sx={{ width: '10%' }}>MỨC GIẢM</TableCell>
                    <TableCell sx={{ width: '14%' }}>THỜI GIAN</TableCell>
                    {kind === 'ORDER' && <TableCell sx={{ width: '18%' }}>ÁP DỤNG</TableCell>}
                    {kind === 'ORDER' && <TableCell sx={{ width: '18%' }}>LƯỢT DÙNG</TableCell>}
                    <TableCell sx={{ width: '12%' }}>TRẠNG THÁI</TableCell>
                    <TableCell align="center" sx={{ pr: 3, width: '9%' }}>
                      THAO TÁC
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={kind === 'ORDER' ? 8 : 6} align="center" sx={{ py: 6 }}>
                        <Typography sx={{ color: C.muted, fontSize: 14 }}>Không có chương trình khuyến mãi nào phù hợp.</Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((promotion, index) => {
                      const { schedule } = promotion;
                      return (
                        <TableRow
                          key={promotion.promotionId}
                          hover
                          // Bấm vào dòng là xem chi tiết (thay cho icon con mắt)
                          tabIndex={0}
                          aria-label={`Xem chi tiết khuyến mãi ${promotion.name}`}
                          onClick={() => navigate(`${base}/${promotion.promotionId}`)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.target === e.currentTarget) navigate(`${base}/${promotion.promotionId}`);
                          }}
                          sx={{ cursor: 'pointer', '&:hover': { bgcolor: '#FAFCFE' } }}
                        >
                          <TableCell align="center" sx={{ pl: 3, color: C.muted, fontWeight: 600 }}>
                            {(currentPage - 1) * PAGE_SIZE + index + 1}
                          </TableCell>
                          {/* Tên khuyến mãi */}
                          <TableCell>
                            <Typography sx={{ fontWeight: 800, color: C.text, fontSize: PAGE_TYPE.td, overflowWrap: 'anywhere' }}>
                              {promotion.name}
                            </Typography>
                            {promotion.description && (
                              <Typography
                                sx={{
                                  fontSize: PAGE_TYPE.tdSub,
                                  color: '#94A3B8',
                                  mt: 0.25,
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden'
                                }}
                              >
                                {promotion.description}
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell>
                            <Typography sx={{ fontSize: PAGE_TYPE.td, fontWeight: 600, color: C.text }}>{discountText(promotion)}</Typography>
                          </TableCell>

                          {/* Thời gian */}
                          <TableCell>
                            <Typography sx={{ fontSize: PAGE_TYPE.td, fontWeight: 600, color: C.text }}>{formatDateTime(promotion.startDate)}</Typography>
                            <Typography sx={{ fontSize: PAGE_TYPE.tdSub, color: '#94A3B8' }}>đến {formatDateTime(promotion.endDate)}</Typography>
                            <Box sx={{ pt: 0.35 }}>
                              <Box
                                sx={{
                                  display: 'inline-block',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  borderRadius: 1.5,
                                  px: 1,
                                  py: 0.2,
                                  bgcolor: schedule === 'ONGOING' ? C.cream : schedule === 'UPCOMING' ? '#E0F2FE' : '#F1F5F9',
                                  color: schedule === 'ONGOING' ? C.creamText : schedule === 'UPCOMING' ? '#0369A1' : C.muted
                                }}
                              >
                                {SCHEDULE_LABEL[schedule]}
                              </Box>
                            </Box>
                          </TableCell>

                          {kind === 'ORDER' && (
                            <TableCell>
                              <Typography sx={{ fontSize: PAGE_TYPE.td, fontWeight: 600, color: C.text }}>Đơn hàng online</Typography>
                              <Typography sx={{ fontSize: PAGE_TYPE.tdSub, color: '#94A3B8' }}>Đơn từ {money(promotion.minOrderValue)}</Typography>
                            </TableCell>
                          )}

                          {kind === 'ORDER' && (
                            <TableCell>
                              <UsageBar promotion={promotion} />
                            </TableCell>
                          )}

                          {/* Trạng thái Switch & Chip chuẩn theo mẫu */}
                          <TableCell onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                            <PromotionSwitch
                              promotion={promotion}
                              onToggle={toggleStatus}
                              disabled={working && confirm?.promotion.promotionId === promotion.promotionId}
                            />
                          </TableCell>

                          {/* Thao tác - Icon phẳng đơn giản */}
                          <TableCell align="center" sx={{ pr: 3 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                            <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center', alignItems: 'center' }}>
                              <Tooltip title="Chỉnh sửa">
                                <IconButton
                                  size="small"
                                  onClick={() => openEdit(promotion)}
                                  sx={{
                                    color: '#64748B',
                                    p: 0.75,
                                    '&:hover': {
                                      color: '#0F172A',
                                      bgcolor: 'transparent'
                                    }
                                  }}
                                >
                                  <EditOutlined style={{ fontSize: 17 }} />
                                </IconButton>
                              </Tooltip>
                              {promotion.canEndEarly && (
                                <Tooltip title="Kết thúc sớm">
                                  <IconButton
                                    size="small"
                                    onClick={() => setConfirm(endEarlyAction(promotion))}
                                    sx={{ color: '#64748B', p: 0.75, '&:hover': { color: '#B45309', bgcolor: 'transparent' } }}
                                  >
                                    <StopOutlined style={{ fontSize: 17 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                              {promotion.canDelete && (
                                <Tooltip title="Xóa">
                                  <IconButton
                                    size="small"
                                    onClick={() => setConfirm(deleteAction(promotion))}
                                    sx={{ color: '#64748B', p: 0.75, '&:hover': { color: '#DC2626', bgcolor: 'transparent' } }}
                                  >
                                    <DeleteOutlined style={{ fontSize: 17 }} />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Phân trang phía dưới */}
            <Pager
              page={currentPage - 1}
              totalPages={pageCount}
              total={filteredPromotions.length}
              size={PAGE_SIZE}
              noun="khuyến mãi"
              onPage={(p) => setPage(p + 1)}
              sx={{ borderTop: `1px solid ${C.borderLight}` }}
            />
          </>
        )}
      </Box>

      <ConfirmDialog confirm={confirm} working={working} onCancel={() => setConfirm(null)} onConfirm={runConfirm} />
      <NoticeDialog message={notice} onClose={() => setNotice('')} />
    </Box>
  );
}

export default function PromotionPage({ kind = 'PRODUCT' }) {
  const { account } = useAuth();

  if (account?.role === 'CUSTOMER') {
    return <CustomerPromotionPage />;
  }

  return <OwnerPromotionView key={kind} kind={kind} />;
}

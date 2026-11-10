import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
import { Pager } from 'features/account/components/Blocks';
import {
  EditOutlined,
  EyeOutlined,
  PlusOutlined,
  SearchOutlined
} from '@ant-design/icons';
import {
  changePromotionStatus,
  getPromotions
} from 'services/promotionService';
import { useAuth } from 'features/auth/AuthProvider';
import CustomerPromotionPage from './CustomerPromotionPage';
import { useCrumbs } from '../../layouts/crumbs';

const C = {
  text: '#1E293B',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cyanText: '#0E7490',
  cream: '#FFF7AE',
  creamHover: '#FFF294',
  creamText: '#713F12'
};

const PAGE_SIZE = 8;

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const dateText = (value) => {
  const date = toDate(value);
  if (!date) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// So sánh cả ngày lẫn giờ, khớp với cách backend kiểm tra hết hạn
function getScheduleStatus(promotion) {
  const now = new Date();
  const startDate = toDate(promotion.startDate);
  const endDate = toDate(promotion.endDate);
  if (!startDate || !endDate) return 'UNKNOWN';
  if (now < startDate) return 'UPCOMING';
  if (now >= endDate) return 'ENDED';
  return 'ONGOING';
}

function isPromotionActive(promotion) {
  if (getScheduleStatus(promotion) === 'ENDED') return false;
  return promotion.status === 'ACTIVE';
}

function getDiscountText(promotion) {
  return promotion.discountType === 'PERCENT'
    ? `${Number(promotion.discountValue)}%`
    : money(promotion.discountValue);
}

function PromotionSwitch({ promotion, onToggleNormal, onEndedClick, disabled }) {
  const isEnded = getScheduleStatus(promotion) === 'ENDED';
  const active = !isEnded && promotion.status === 'ACTIVE';

  const handleToggle = () => {
    if (isEnded) {
      onEndedClick(promotion);
    } else {
      onToggleNormal(promotion);
    }
  };

  return (
    <Stack direction="row" alignItems="center" spacing={1.25} sx={{ pt: 0.5 }}>
      <Switch
        checked={active}
        disabled={disabled}
        onChange={handleToggle}
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
        {active ? 'Đang bật' : 'Đang tắt'}
      </Box>
    </Stack>
  );
}

function OwnerPromotionView() {
  useCrumbs(['Danh sách khuyến mãi']);

  const navigate = useNavigate();
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [scheduleFilter, setScheduleFilter] = useState('ALL');
  const [enableFilter, setEnableFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [statusTarget, setStatusTarget] = useState(null);
  const [endedTarget, setEndedTarget] = useState(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getPromotions();
      setPromotions(Array.isArray(data) ? data : []);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không thể tải danh sách khuyến mãi.');
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
      const matchesSearch = (promotion.name || '')
        .toLocaleLowerCase('vi-VN')
        .includes(keyword);
      const matchesSchedule =
        scheduleFilter === 'ALL' ||
        getScheduleStatus(promotion) === scheduleFilter;
      const matchesEnable =
        enableFilter === 'ALL' ||
        (enableFilter === 'ACTIVE' && isPromotionActive(promotion)) ||
        (enableFilter === 'INACTIVE' && !isPromotionActive(promotion));
      return matchesSearch && matchesSchedule && matchesEnable;
    });
  }, [promotions, search, scheduleFilter, enableFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredPromotions.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const rows = filteredPromotions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleStatusChange = async () => {
    if (!statusTarget || changingStatus) return;
    setChangingStatus(true);
    try {
      const nextStatus = statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
      await changePromotionStatus(statusTarget.promotionId, nextStatus);
      setPromotions((prev) =>
        prev.map((item) =>
          item.promotionId === statusTarget.promotionId ? { ...item, status: nextStatus } : item
        )
      );
      setStatusTarget(null);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || 'Không thể thay đổi trạng thái khuyến mãi.');
    } finally {
      setChangingStatus(false);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setScheduleFilter('ALL');
    setEnableFilter('ALL');
    setPage(1);
  };

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', color: C.text, pb: 4 }}>
      {/* ─── TIÊU ĐỀ TRÊN CÙNG: DANH SÁCH KHUYẾN MÃI ─── */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Typography variant="h3" sx={{ fontWeight: 800, color: C.text }}>
          Danh sách khuyến mãi
        </Typography>
        <Button
          variant="contained"
          startIcon={<PlusOutlined />}
          onClick={() => navigate('/promotions/add')}
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
          Thêm khuyến mãi
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
            sm: 'repeat(2, 1fr)',
            md: 'minmax(200px, 1.8fr) 180px 180px auto'
          },
          gap: { xs: 1.5, lg: 2 },
          alignItems: 'flex-end'
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Tìm kiếm khuyến mãi
          </Typography>
          <TextField
            fullWidth
            size="small"
            placeholder="Tìm theo tên khuyến mãi..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                </InputAdornment>
              )
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

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Thời gian
          </Typography>
          <Select
            fullWidth
            size="small"
            value={scheduleFilter}
            onChange={(e) => {
              setScheduleFilter(e.target.value);
              setPage(1);
            }}
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
            <MenuItem value="ALL">Tất cả</MenuItem>
            <MenuItem value="ONGOING">Đang diễn ra</MenuItem>
            <MenuItem value="UPCOMING">Sắp diễn ra</MenuItem>
            <MenuItem value="ENDED">Đã kết thúc</MenuItem>
          </Select>
        </Box>

        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Trạng thái
          </Typography>
          <Select
            fullWidth
            size="small"
            value={enableFilter}
            onChange={(e) => {
              setEnableFilter(e.target.value);
              setPage(1);
            }}
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
            <MenuItem value="ALL">Tất cả</MenuItem>
            <MenuItem value="ACTIVE">Đang bật</MenuItem>
            <MenuItem value="INACTIVE">Đang tắt</MenuItem>
          </Select>
        </Box>

        {/* Nút Bỏ lọc */}
        <Box sx={{ minWidth: 0, display: 'flex' }}>
          <Button
            variant="outlined"
            onClick={handleResetFilters}
            disableRipple
            sx={{
              height: 44,
              px: 1.75,
              minWidth: 'unset',
              borderRadius: 2.5,
              textTransform: 'none',
              fontSize: 13,
              fontWeight: 600,
              borderColor: C.border,
              bgcolor: C.surface,
              color: C.text,
              whiteSpace: 'nowrap',
              outline: 'none',
              boxShadow: 'none !important',
              transition: 'none',
              '&:hover': {
                bgcolor: C.surface,
                borderColor: C.border,
                color: C.text,
                outline: 'none',
                boxShadow: 'none !important'
              },
              '&:focus': { outline: 'none', boxShadow: 'none !important' },
              '&:focus-visible': { outline: 'none', boxShadow: 'none !important' },
              '&.Mui-focusVisible': { outline: 'none', boxShadow: 'none !important' },
              '&:active': { outline: 'none', boxShadow: 'none !important' }
            }}
          >
            Bỏ lọc
          </Button>
        </Box>
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
                  minWidth: 800,
                  '& th': {
                    bgcolor: C.surface,
                    color: C.muted,
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    py: 1.75,
                    borderBottom: `1px solid ${C.borderLight}`
                  },
                  '& td': {
                    borderColor: C.borderLight,
                    py: 2,
                    fontSize: 13.5,
                    color: C.text
                  }
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ pl: 3 }}>TÊN KHUYẾN MÃI</TableCell>
                    <TableCell>MỨC GIẢM</TableCell>
                    <TableCell>THỜI GIAN</TableCell>
                    <TableCell sx={{ minWidth: 150 }}>SỬ DỤNG</TableCell>
                    <TableCell>TRẠNG THÁI</TableCell>
                    <TableCell align="center" sx={{ pr: 3 }}>THAO TÁC</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 6 }}>
                        <Typography sx={{ color: C.muted, fontSize: 14 }}>
                          Không có chương trình khuyến mãi nào phù hợp.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((promotion) => {
                      const schedule = getScheduleStatus(promotion);
                      return (
                        <TableRow
                          key={promotion.promotionId}
                          hover
                          sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}
                        >
                          {/* Tên khuyến mãi */}
                          <TableCell sx={{ pl: 3 }}>
                            <Typography sx={{ fontWeight: 800, color: C.text, fontSize: 13.5, overflowWrap: 'anywhere' }}>
                              {promotion.name}
                            </Typography>
                            {promotion.description && (
                              <Typography sx={{ fontSize: 12, color: '#94A3B8', mt: 0.25 }}>
                                {promotion.description}
                              </Typography>
                            )}
                          </TableCell>

                          {/* Mức giảm - Màu vàng nhạt giống badge Tiền mặt */}
                          <TableCell>
                            <Box
                              sx={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                px: 1.5,
                                py: 0.5,
                                borderRadius: 4,
                                bgcolor: C.cream,
                                color: C.creamText,
                                fontSize: 12,
                                fontWeight: 700,
                                letterSpacing: '0.01em'
                              }}
                            >
                              {getDiscountText(promotion)}
                            </Box>
                          </TableCell>

                          {/* Thời gian */}
                          <TableCell>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                              {dateText(promotion.startDate)}
                            </Typography>
                            <Typography sx={{ fontSize: 11.5, color: '#94A3B8' }}>
                              đến {dateText(promotion.endDate)}
                            </Typography>
                            <Box sx={{ pt: 0.35 }}>
                              <Box
                                sx={{
                                  display: 'inline-block',
                                  fontSize: 11,
                                  fontWeight: 700,
                                  borderRadius: 1.5,
                                  px: 1,
                                  py: 0.2,
                                  bgcolor:
                                    schedule === 'ONGOING'
                                      ? C.cream
                                      : schedule === 'UPCOMING'
                                      ? '#E0F2FE'
                                      : '#F1F5F9',
                                  color:
                                    schedule === 'ONGOING'
                                      ? C.creamText
                                      : schedule === 'UPCOMING'
                                      ? '#0369A1'
                                      : C.muted
                                }}
                              >
                                {schedule === 'ONGOING'
                                  ? 'Đang diễn ra'
                                  : schedule === 'UPCOMING'
                                  ? 'Sắp diễn ra'
                                  : 'Đã kết thúc'}
                              </Box>
                            </Box>
                          </TableCell>

                          {/* Sử dụng - Đoạn tiến độ 0-100% màu xanh chủ đạo */}
                          <TableCell sx={{ minWidth: 150 }}>
                            {promotion.usageLimit == null ? (
                              <Box sx={{ width: '100%', maxWidth: 130 }}>
                                <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.text, mb: 0.6 }}>
                                  Không giới hạn
                                </Typography>
                                <Box
                                  sx={{
                                    width: '100%',
                                    height: 7,
                                    borderRadius: 4,
                                    bgcolor: '#F1F5F9',
                                    border: `1px solid ${C.border}`
                                  }}
                                />
                              </Box>
                            ) : (
                              (() => {
                                const used = promotion.usedCount || 0;
                                const limit = promotion.usageLimit;
                                const percent = Math.min(100, Math.round((used * 100) / limit));
                                return (
                                  <Tooltip title={`Đã dùng: ${used} / ${limit} lượt`}>
                                    <Box sx={{ width: '100%', maxWidth: 130, cursor: 'default' }}>
                                      <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.text, mb: 0.6 }}>
                                        {percent}%
                                      </Typography>
                                      <Box
                                        sx={{
                                          width: '100%',
                                          height: 7,
                                          borderRadius: 4,
                                          bgcolor: '#F1F5F9',
                                          border: `1px solid ${C.border}`,
                                          overflow: 'hidden'
                                        }}
                                      >
                                        <Box
                                          sx={{
                                            width: `${percent}%`,
                                            height: '100%',
                                            bgcolor: C.cyan,
                                            borderRadius: 4,
                                            transition: 'width 0.3s ease'
                                          }}
                                        />
                                      </Box>
                                    </Box>
                                  </Tooltip>
                                );
                              })()
                            )}
                          </TableCell>

                          {/* Trạng thái Switch & Chip chuẩn theo mẫu */}
                          <TableCell>
                            <PromotionSwitch
                              promotion={promotion}
                              onToggleNormal={setStatusTarget}
                              onEndedClick={setEndedTarget}
                              disabled={changingStatus && statusTarget?.promotionId === promotion.promotionId}
                            />
                          </TableCell>

                          {/* Thao tác - Icon phẳng đơn giản */}
                          <TableCell align="center" sx={{ pr: 3 }}>
                            <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.5}>
                              <Tooltip title="Xem chi tiết">
                                <IconButton
                                  size="small"
                                  onClick={() => navigate(`/promotions/${promotion.promotionId}`)}
                                  sx={{
                                    color: '#64748B',
                                    p: 0.75,
                                    '&:hover': {
                                      color: '#0F172A',
                                      bgcolor: 'transparent'
                                    }
                                  }}
                                >
                                  <EyeOutlined style={{ fontSize: 17 }} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Chỉnh sửa">
                                <IconButton
                                  size="small"
                                  onClick={() => navigate(`/promotions/${promotion.promotionId}/edit`)}
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

      {/* Xác nhận bật/tắt bình thường (khi chưa kết thúc) */}
      <Dialog
        open={Boolean(statusTarget)}
        onClose={() => !changingStatus && setStatusTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3.5, border: `1px solid ${C.border}`, p: 1 }
        }}
      >
        <DialogTitle sx={{ color: C.text, fontWeight: 700, fontSize: 17, pb: 1 }}>
          {statusTarget && statusTarget.status === 'ACTIVE' ? 'Tắt khuyến mãi?' : 'Bật khuyến mãi?'}
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: C.muted }}>
            Bạn có chắc muốn {statusTarget && statusTarget.status === 'ACTIVE' ? 'tắt' : 'bật'} chương trình{' '}
            <strong style={{ color: C.text }}>{statusTarget?.name}</strong>?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button
            onClick={() => setStatusTarget(null)}
            disabled={changingStatus}
            sx={{
              color: C.muted,
              textTransform: 'none',
              fontSize: 13.5,
              borderRadius: 2
            }}
          >
            Hủy
          </Button>
          <Button
            variant="contained"
            onClick={handleStatusChange}
            disabled={changingStatus}
            sx={{
              bgcolor: C.cyan,
              color: C.text,
              boxShadow: 'none',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 13.5,
              borderRadius: 2,
              px: 2.5,
              '&:hover': { bgcolor: C.cyanHover, boxShadow: 'none' }
            }}
          >
            {changingStatus ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Popup thông báo khi click bật khuyến mãi đã kết thúc */}
      <Dialog
        open={Boolean(endedTarget)}
        onClose={() => setEndedTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3.5, border: `1px solid ${C.border}`, p: 1 }
        }}
      >
        <DialogTitle sx={{ color: C.text, fontWeight: 700, fontSize: 17, pb: 1 }}>
          Khuyến mãi đã kết thúc
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 13.5, color: C.muted, lineHeight: 1.6 }}>
            Chương trình <strong style={{ color: C.text }}>{endedTarget?.name}</strong> đã kết thúc vào lúc{' '}
            <strong style={{ color: C.text }}>{dateText(endedTarget?.endDate)}</strong>.
            <br />
            Vui lòng chỉnh sửa ngày kết thúc sang tương lai để có thể bật lại khuyến mãi.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1, gap: 1 }}>
          <Button
            onClick={() => setEndedTarget(null)}
            sx={{
              color: C.muted,
              textTransform: 'none',
              fontSize: 13.5,
              borderRadius: 2
            }}
          >
            Đóng
          </Button>
          <Button
            variant="contained"
            onClick={() => {
              const id = endedTarget?.promotionId;
              setEndedTarget(null);
              navigate(`/promotions/${id}/edit`);
            }}
            sx={{
              bgcolor: C.cyan,
              color: C.text,
              boxShadow: 'none',
              textTransform: 'none',
              fontWeight: 700,
              fontSize: 13.5,
              borderRadius: 2,
              px: 2.5,
              '&:hover': { bgcolor: C.cyanHover, boxShadow: 'none' }
            }}
          >
            Chỉnh sửa ngay
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default function PromotionPage() {
  const { account } = useAuth();

  if (account?.role === 'CUSTOMER') {
    return <CustomerPromotionPage />;
  }

  return <OwnerPromotionView />;
}


import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    Alert,
    Box,
    Button,
    Card,
    CardContent,
    CircularProgress,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    MenuItem,
    Pagination,
    Stack,
    Switch,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Typography
} from '@mui/material';

import {
    EyeOutlined,
    EditOutlined,
    PlusOutlined,
    SearchOutlined
} from '@ant-design/icons';

import {
    changePromotionStatus,
    getPromotions
} from 'services/promotionService';

const C = {
    text: '#202D42',
    muted: '#75869F',
    border: '#E5E7E3',
    cyan: '#8DE9F2',
    cyanHover: '#6DDDE9',
    green: '#168B70',
    greenLight: '#E7F6F1',
    greenTrack: '#B9F0F0',
    bg: '#FAFAF8',
    white: '#FFFFFF'
};

const PAGE_SIZE = 8;
const FONT_SIZE = 13;

const cardSx = {
    border: `1px solid ${C.border}`,
    borderRadius: 2.5,
    boxShadow: 'none',
    bgcolor: C.white
};

const money = (value) =>
    `${Number(value || 0).toLocaleString('vi-VN')} đ`;

const getLocalToday = () => {
    const today = new Date();

    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
};

const getDateOnly = (value) => {
    if (!value) return '';

    return String(value).slice(0, 10);
};

const dateText = (value) => {
    const dateValue = getDateOnly(value);

    if (!dateValue) return '—';

    const [year, month, day] = dateValue.split('-');

    return `${day}/${month}/${year}`;
};

/**
 * Trạng thái thời gian chỉ dựa vào ngày bắt đầu và kết thúc.
 * Không phụ thuộc promotion.status.
 */
function getScheduleStatus(promotion) {
    const today = getLocalToday();
    const startDate = getDateOnly(promotion.startDate);
    const endDate = getDateOnly(promotion.endDate);

    if (!startDate || !endDate) return 'UNKNOWN';

    if (today < startDate) return 'UPCOMING';
    if (today > endDate) return 'ENDED';

    return 'ONGOING';
}

/**
 * Trạng thái bật/tắt chỉ dựa vào trường status trong database.
 */
function isPromotionActive(promotion) {
    return promotion.status === 'ACTIVE';
}

function getDiscountText(promotion) {
    return promotion.discountType === 'PERCENT'
        ? `${Number(promotion.discountValue)}%`
        : money(promotion.discountValue);
}

function PromotionSwitch({ promotion, onChange, disabled }) {
  const active = promotion.status === 'ACTIVE';

  return (
    <Stack direction="row" alignItems="center" spacing={1}>
      <Switch checked={active} disabled={disabled} onChange={() => onChange(promotion)} size="small" color="success" />

      <Chip
        size="small"
        label={active ? 'Đang bật' : 'Đang tắt'}
        sx={{
          bgcolor: active ? '#E7F6F1' : '#F0F2F4',
          color: active ? '#168B70' : '#75869F',
          fontSize: 13
        }}
      />
    </Stack>
  );
}

export default function PromotionPage() {
    const navigate = useNavigate();

    const [promotions, setPromotions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [search, setSearch] = useState('');

    // Bộ lọc thời gian: chỉ xét ngày bắt đầu và kết thúc.
    const [scheduleFilter, setScheduleFilter] = useState('ALL');

    // Bộ lọc trạng thái: chỉ xét ACTIVE / INACTIVE.
    const [enableFilter, setEnableFilter] = useState('ALL');

    const [page, setPage] = useState(1);

    const [statusTarget, setStatusTarget] = useState(null);
    const [changingStatus, setChangingStatus] = useState(false);

    const loadPromotions = useCallback(async () => {
        setLoading(true);

        try {
            const data = await getPromotions();

            setPromotions(Array.isArray(data) ? data : []);
            setError('');
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                err?.message ||
                'Không thể tải danh sách khuyến mãi.'
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadPromotions();
    }, [loadPromotions]);

    // Lọc theo tên, thời gian và trạng thái độc lập.
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

    const pageCount = Math.max(
        1,
        Math.ceil(filteredPromotions.length / PAGE_SIZE)
    );

    const currentPage = Math.min(page, pageCount);

    const rows = filteredPromotions.slice(
        (currentPage - 1) * PAGE_SIZE,
        currentPage * PAGE_SIZE
    );

    // Chỉ thay đổi trạng thái ACTIVE / INACTIVE.
    const handleStatusChange = async () => {
        if (!statusTarget || changingStatus) return;

        setChangingStatus(true);

        try {
            const nextStatus = isPromotionActive(statusTarget)
                ? 'INACTIVE'
                : 'ACTIVE';

            await changePromotionStatus(
                statusTarget.promotionId,
                nextStatus
            );

            setPromotions((previous) =>
                previous.map((promotion) =>
                    promotion.promotionId === statusTarget.promotionId
                        ? { ...promotion, status: nextStatus }
                        : promotion
                )
            );

            setStatusTarget(null);
            setError('');
        } catch (err) {
            setError(
                err?.response?.data?.message ||
                err?.message ||
                'Không thể thay đổi trạng thái khuyến mãi.'
            );
        } finally {
            setChangingStatus(false);
        }
    };

    const handleFilterChange = (setter) => (event) => {
        setter(event.target.value);
        setPage(1);
    };

    return (
      <Box
        sx={{
          px: { xs: 1.5, md: 3 },
          py: 2,
          width: '100%',
          maxWidth: 1500,
          mx: 'auto',
          bgcolor: C.bg,
          minHeight: '100%',
          boxSizing: 'border-box'
        }}
      >
        {/* Tiêu đề */}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={{ xs: 'stretch', sm: 'center' }}
          spacing={1.5}
          sx={{ mb: 2.5 }}
        >
          <Box>
            <Typography
              sx={{
                color: C.text,
                fontSize: { xs: 23, md: 27 },
                fontWeight: 700
              }}
            >
              Quản lý khuyến mãi
            </Typography>

          </Box>

          <Button
            variant="contained"
            startIcon={<PlusOutlined />}
            onClick={() => navigate('/promotions/add')}
            sx={{
              bgcolor: C.cyan,
              color: C.text,
              borderRadius: 1.5,
              px: 1,
              py: 0,
              height: 40,
              minHeight: '40px',
              fontSize: 11,
              lineHeight: 1,
              textTransform: 'none',
              fontWeight: 600,
              boxShadow: 'none',
              '& .MuiButton-startIcon': {
                fontSize: 14,
                mr: 0.5,
                marginRight: '4px'
              },
              '&:hover': {
                bgcolor: C.cyanHover,
                boxShadow: 'none'
              }
            }}
          >
            Thêm khuyến mãi
          </Button>
        </Stack>

        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
            {error}
          </Alert>
        )}

        <Card sx={cardSx}>
          {/* Tìm kiếm và bộ lọc */}
          <CardContent sx={{ p: 2 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
              <TextField
                fullWidth
                size="small"
                placeholder="Tìm kiếm theo tên khuyến mãi..."
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                InputProps={{
                  startAdornment: (
                    <SearchOutlined
                      style={{
                        marginRight: 10,
                        color: C.muted
                      }}
                    />
                  )
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    height: 42,
                    borderRadius: 1.5,
                    fontSize: FONT_SIZE
                  }
                }}
              />

              {/* Lọc thời gian */}
              <TextField
                select
                size="small"
                label="Thời gian"
                value={scheduleFilter}
                onChange={handleFilterChange(setScheduleFilter)}
                sx={{
                  width: { xs: '100%', md: 190 },
                  flexShrink: 0,
                  '& .MuiOutlinedInput-root': {
                    height: 42,
                    borderRadius: 1.5,
                    fontSize: FONT_SIZE
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: FONT_SIZE
                  }
                }}
              >
                <MenuItem value="ALL">Tất cả thời gian</MenuItem>
                <MenuItem value="ONGOING">Đang diễn ra</MenuItem>
                <MenuItem value="UPCOMING">Sắp diễn ra</MenuItem>
                <MenuItem value="ENDED">Đã kết thúc</MenuItem>
              </TextField>

              {/* Lọc trạng thái bật/tắt */}
              <TextField
                select
                size="small"
                label="Trạng thái"
                value={enableFilter}
                onChange={handleFilterChange(setEnableFilter)}
                sx={{
                  width: { xs: '100%', md: 170 },
                  flexShrink: 0,
                  '& .MuiOutlinedInput-root': {
                    height: 42,
                    borderRadius: 1.5,
                    fontSize: FONT_SIZE
                  },
                  '& .MuiInputLabel-root': {
                    fontSize: FONT_SIZE
                  }
                }}
              >
                <MenuItem value="ALL">Tất cả trạng thái</MenuItem>
                <MenuItem value="ACTIVE">Đang bật</MenuItem>
                <MenuItem value="INACTIVE">Đang tắt</MenuItem>
              </TextField>
            </Stack>
          </CardContent>

          {/* Bảng */}
          {loading ? (
            <Box
              sx={{
                py: 7,
                display: 'flex',
                justifyContent: 'center'
              }}
            >
              <CircularProgress />
            </Box>
          ) : (
            <>
              <TableContainer
                sx={{
                  borderTop: `1px solid ${C.border}`,
                  overflowX: 'auto'
                }}
              >
                <Table
                  sx={{
                    minWidth: 820,
                    '& th': {
                      bgcolor: '#F8FAFA',
                      color: C.muted,
                      fontSize: FONT_SIZE,
                      fontWeight: 600,
                      py: 1.75,
                      whiteSpace: 'nowrap'
                    },
                    '& td': {
                      borderColor: C.border,
                      py: 1.75,
                      fontSize: FONT_SIZE,
                      color: C.text
                    },
                    '& tbody tr:last-child td': {
                      borderBottom: 0
                    }
                  }}
                >
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '25%' }}>Tên khuyến mãi</TableCell>

                      <TableCell sx={{ width: '15%' }}>Mức giảm</TableCell>

                      <TableCell sx={{ width: '23%' }}>Thời gian</TableCell>

                      <TableCell sx={{ width: '22%' }}>Trạng thái</TableCell>

                      <TableCell align="center" sx={{ width: '15%' }}>
                        Thao tác
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Typography
                            sx={{
                              py: 4,
                              color: C.muted,
                              fontSize: FONT_SIZE
                            }}
                          >
                            Không có khuyến mãi phù hợp.
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((promotion) => (
                        <TableRow hover key={promotion.promotionId}>
                          <TableCell>
                            <Typography
                              sx={{
                                color: C.text,
                                fontSize: FONT_SIZE,
                                fontWeight: 500,
                                overflowWrap: 'anywhere'
                              }}
                            >
                              {promotion.name}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Typography
                              sx={{
                                color: '#35B8C5',
                                fontWeight: 600,
                                fontSize: FONT_SIZE
                              }}
                            >
                              {getDiscountText(promotion)}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Stack spacing={0.4}>
                              <Typography
                                sx={{
                                  fontSize: FONT_SIZE,
                                  color: C.text
                                }}
                              >
                                {dateText(promotion.startDate)}
                              </Typography>

                              <Typography
                                sx={{
                                  fontSize: FONT_SIZE,
                                  color: C.muted
                                }}
                              >
                                đến {dateText(promotion.endDate)}
                              </Typography>
                            </Stack>
                          </TableCell>

                          {/* Chỉ hiển thị trạng thái bật/tắt */}
                          <TableCell>
                            <PromotionSwitch
                              promotion={promotion}
                              disabled={changingStatus && statusTarget?.promotionId === promotion.promotionId}
                              onChange={setStatusTarget}
                            />
                          </TableCell>

                          <TableCell align="center">
                            <Stack direction="row" justifyContent="center" alignItems="center" spacing={0.5}>
                              <IconButton
                                size="small"
                                title="Xem chi tiết"
                                aria-label="Xem chi tiết"
                                onClick={() => navigate(`/promotions/${promotion.promotionId}`)}
                                sx={{
                                  width: 34,
                                  height: 34,
                                  color: '#278C98',
                                  borderRadius: 1.5,
                                  '&:hover': {
                                    bgcolor: '#EAFBFD'
                                  }
                                }}
                              >
                                <EyeOutlined />
                              </IconButton>

                              <IconButton
                                size="small"
                                title="Chỉnh sửa"
                                aria-label="Chỉnh sửa"
                                onClick={() => navigate(`/promotions/edit/${promotion.promotionId}`)}
                                sx={{
                                  width: 34,
                                  height: 34,
                                  color: '#278C98',
                                  borderRadius: 1.5,
                                  '&:hover': {
                                    bgcolor: '#EAFBFD'
                                  }
                                }}
                              >
                                <EditOutlined />
                              </IconButton>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </TableContainer>

              {/* Phân trang */}
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                justifyContent="space-between"
                alignItems="center"
                spacing={1}
                sx={{
                  px: 2,
                  py: 1.5,
                  borderTop: `1px solid ${C.border}`
                }}
              >
                <Typography
                  sx={{
                    fontSize: FONT_SIZE,
                    color: C.muted
                  }}
                >
                  Hiển thị {filteredPromotions.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–
                  {Math.min(currentPage * PAGE_SIZE, filteredPromotions.length)} / {filteredPromotions.length} khuyến mãi
                </Typography>

                <Pagination
                  count={pageCount}
                  page={currentPage}
                  onChange={(_, value) => setPage(value)}
                  size="small"
                  shape="rounded"
                  sx={{
                    '& .MuiPaginationItem-root': {
                      fontSize: FONT_SIZE
                    },
                    '& .MuiPaginationItem-root.Mui-selected': {
                      bgcolor: C.cyan,
                      color: C.text
                    },
                    '& .MuiPaginationItem-root.Mui-selected:hover': {
                      bgcolor: C.cyanHover
                    }
                  }}
                />
              </Stack>
            </>
          )}
        </Card>

        {/* Xác nhận bật/tắt */}
        <Dialog open={Boolean(statusTarget)} onClose={() => !changingStatus && setStatusTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle
            sx={{
              color: C.text,
              fontWeight: 700,
              fontSize: 17
            }}
          >
            {statusTarget && isPromotionActive(statusTarget) ? 'Tắt khuyến mãi?' : 'Bật khuyến mãi?'}
          </DialogTitle>

          <DialogContent>
            <Typography
              sx={{
                fontSize: FONT_SIZE,
                color: C.muted
              }}
            >
              Bạn có chắc muốn {statusTarget && isPromotionActive(statusTarget) ? 'tắt' : 'bật'} chương trình{' '}
              <strong>{statusTarget?.name}</strong>?
            </Typography>
          </DialogContent>

          <DialogActions sx={{ p: 2 }}>
            <Button
              onClick={() => setStatusTarget(null)}
              disabled={changingStatus}
              sx={{
                color: C.muted,
                textTransform: 'none',
                fontSize: FONT_SIZE
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
                fontSize: FONT_SIZE,
                '&:hover': {
                  bgcolor: C.cyanHover
                }
              }}
            >
              {changingStatus ? 'Đang xử lý...' : 'Xác nhận'}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
}

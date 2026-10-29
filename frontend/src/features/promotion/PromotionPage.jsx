
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Pagination,
  Stack,
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
  EditOutlined,
  EyeOutlined,
  SearchOutlined
} from '@ant-design/icons';
import {
  changePromotionStatus,
  getPromotionById,
  getPromotions
} from 'services/promotionService';

const C = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5E7E3',
  cyan: '#8DE9F2',
  cyanHover: '#6DDDE9',
  cyanLight: '#EAFBFD',
  yellowLight: '#FFFBE7',
  bg: '#FAFAF8'
};

const PAGE_SIZE = 8;

const cardSx = {
  border: `1px solid ${C.border}`,
  borderRadius: 2.5,
  boxShadow: 'none',
  bgcolor: '#fff'
};

const buttonSx = {
  bgcolor: C.cyan,
  color: C.text,
  fontWeight: 600,
  boxShadow: 'none',
  '&:hover': {
    bgcolor: C.cyanHover,
    boxShadow: 'none'
  }
};

const money = (value) =>
    `${Number(value || 0).toLocaleString('vi-VN')} đ`;

const dateText = (value) => {
  if (!value) return '—';

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime())
      ? '—'
      : date.toLocaleDateString('vi-VN');
};

const today = () => {
  const date = new Date();

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');
};

function statusOf(promotion) {
  if (promotion.status !== 'ACTIVE') {
    return { label: 'Đã tắt', color: 'default' };
  }

  const currentDate = today();

  if (currentDate < promotion.startDate) {
    return { label: 'Sắp diễn ra', color: 'info' };
  }

  if (currentDate > promotion.endDate) {
    return { label: 'Đã kết thúc', color: 'default' };
  }

  return { label: 'Đang diễn ra', color: 'success' };
}

const discountText = (promotion) =>
    promotion.discountType === 'PERCENT'
        ? `${Number(promotion.discountValue)}%`
        : money(promotion.discountValue);

function StatCard({ title, value, color }) {
  return (
      <Card sx={{ ...cardSx, bgcolor: color, height: '100%' }}>
        <CardContent sx={{ px: 2, py: '12px !important' }}>
          <Typography fontSize={13} color={C.muted}>
            {title}
          </Typography>

          <Typography
              sx={{
                mt: 0.5,
                fontSize: 25,
                fontWeight: 700,
                color: C.text
              }}
          >
            {value}
          </Typography>
        </CardContent>
      </Card>
  );
}

export default function PromotionPage() {
  const navigate = useNavigate();

  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  const [changingStatus, setChangingStatus] = useState(false);

  const loadPromotions = useCallback(async () => {
    setLoading(true);

    try {
      const data = await getPromotions();
      setPromotions(Array.isArray(data) ? data : []);
      setError('');
    } catch (e) {
      setError(e?.message || 'Không tải được danh sách khuyến mãi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPromotions();
  }, [loadPromotions]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi-VN');

    return promotions.filter((promotion) => {
      const searchableText =
          `${promotion.name || ''} ${promotion.description || ''}`
              .toLocaleLowerCase('vi-VN');

      if (!searchableText.includes(keyword)) {
        return false;
      }

      const status = statusOf(promotion).label;

      switch (filter) {
        case 'ACTIVE':
          return promotion.status === 'ACTIVE';
        case 'INACTIVE':
          return promotion.status === 'INACTIVE';
        case 'ONGOING':
          return status === 'Đang diễn ra';
        case 'UPCOMING':
          return status === 'Sắp diễn ra';
        case 'ENDED':
          return status === 'Đã kết thúc';
        default:
          return true;
      }
    });
  }, [promotions, search, filter]);

  const pageCount = Math.max(
      1,
      Math.ceil(filtered.length / PAGE_SIZE)
  );

  const currentPage = Math.min(page, pageCount);

  const rows = filtered.slice(
      (currentPage - 1) * PAGE_SIZE,
      currentPage * PAGE_SIZE
  );

  const ongoingCount = promotions.filter(
      (promotion) =>
          statusOf(promotion).label === 'Đang diễn ra'
  ).length;

  async function openDetail(promotion) {
    try {
      const data = await getPromotionById(promotion.promotionId);
      setDetail(data);
      setError('');
    } catch (e) {
      setError(e?.message || 'Không tải được chi tiết khuyến mãi.');
    }
  }

  async function handleStatusChange() {
    if (!statusTarget || changingStatus) {
      return;
    }

    setChangingStatus(true);

    try {
      const nextStatus =
          statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

      await changePromotionStatus(
          statusTarget.promotionId,
          nextStatus
      );

      setStatusTarget(null);
      setSuccess(
          nextStatus === 'ACTIVE'
              ? 'Đã bật khuyến mãi.'
              : 'Đã tắt khuyến mãi.'
      );

      await loadPromotions();
    } catch (e) {
      setError(
          e?.message || 'Không thể đổi trạng thái khuyến mãi.'
      );
    } finally {
      setChangingStatus(false);
    }
  }

  return (
    <Box
      sx={{
        px: { xs: 1.5, md: 3 },
        pt: 0,
        pb: 2,
        width: '100%',
        maxWidth: 1500,
        mx: 'auto',
        bgcolor: C.bg,
        minHeight: '100%',
        boxSizing: 'border-box'
      }}
    >
      {/* Page header */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'stretch', sm: 'center' }}
        spacing={1.5}
        sx={{ mb: 2 }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Typography
            variant="h5"
            sx={{
              color: C.text,
              fontWeight: 700,
              fontSize: { xs: 22, md: 26 }
            }}
          >
            Quản lý khuyến mãi
          </Typography>

          <Typography fontSize={13} color={C.muted} sx={{ mt: 0.5 }}>
            Quản lý chương trình giảm giá của cửa hàng.
          </Typography>
        </Box>

        <Button
          variant="contained"
          onClick={() => navigate('/promotions/add')}
          sx={{
            ...buttonSx,
            alignSelf: { xs: 'flex-start', sm: 'center' },
            ml: { sm: 'auto' },
            px: 2,
            py: 1,
            borderRadius: 2,
            whiteSpace: 'nowrap'
          }}
        >
          Thêm khuyến mãi
        </Button>
      </Stack>

      {/* Notifications */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* Statistics */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={6} sm={3} md={2}>
          <StatCard title="Tổng khuyến mãi" value={promotions.length} color={C.cyanLight} />
        </Grid>

        <Grid item xs={6} sm={3} md={2}>
          <StatCard title="Đang diễn ra" value={ongoingCount} color={C.yellowLight} />
        </Grid>
      </Grid>

      {/* Search, filter and table */}
      <Card sx={cardSx}>
        <CardContent
          sx={{
            p: { xs: 1.5, md: 1.5 },
            pb: '12px !important'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              width: '100%'
            }}
          >
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm theo tên hoặc mô tả..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              InputProps={{
                startAdornment: (
                  <SearchOutlined
                    style={{
                      marginRight: 12,
                      color: C.muted,
                      fontSize: 18
                    }}
                  />
                )
              }}
              sx={{
                flex: 1,
                minWidth: 0,
                '& .MuiOutlinedInput-root': {
                  height: 44,
                  borderRadius: 2,
                  bgcolor: '#fff'
                }
              }}
            />

            <TextField
              select
              size="small"
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
              sx={{
                width: 232,
                flexShrink: 0,
                '& .MuiOutlinedInput-root': {
                  height: 44,
                  borderRadius: 2,
                  bgcolor: '#fff'
                }
              }}
            >
              <MenuItem value="ALL">Tất cả trạng thái</MenuItem>
              <MenuItem value="ACTIVE">Đã bật</MenuItem>
              <MenuItem value="INACTIVE">Đã tắt</MenuItem>
              <MenuItem value="ONGOING">Đang diễn ra</MenuItem>
              <MenuItem value="UPCOMING">Sắp diễn ra</MenuItem>
              <MenuItem value="ENDED">Đã kết thúc</MenuItem>
            </TextField>
          </Box>
        </CardContent>

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
                overflowX: 'auto',
                borderTop: `1px solid ${C.border}`
              }}
            >
              <Table
                size="medium"
                sx={{
                  width: '100%',
                  tableLayout: 'fixed',

                  '& th': {
                    bgcolor: '#FAFAF8',
                    color: '#607087',
                    fontWeight: 600,
                    fontSize: 13,
                    py: 1.5,
                    borderBottom: `1px solid ${C.border}`,
                    whiteSpace: 'nowrap'
                  },

                  '& td': {
                    borderColor: C.border,
                    py: 1.5,
                    verticalAlign: 'middle'
                  },

                  '& tbody tr:last-child td': {
                    borderBottom: 0
                  }
                }}
              >
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: '28%' }}>Khuyến mãi</TableCell>
                    <TableCell sx={{ width: '16%' }}>Giảm giá</TableCell>
                    <TableCell sx={{ width: '22%' }}>Thời gian</TableCell>
                    <TableCell sx={{ width: '16%' }}>Trạng thái</TableCell>
                    <TableCell align="right" sx={{ width: '18%' }}>
                      Thao tác
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} align="center" sx={{ py: 6, color: C.muted }}>
                        {promotions.length === 0 ? 'Chưa có chương trình khuyến mãi.' : 'Không có khuyến mãi phù hợp.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((promotion) => {
                      const status = statusOf(promotion);

                      return (
                        <TableRow hover key={promotion.promotionId}>
                          <TableCell>
                            <Typography fontSize={13} fontWeight={600} color={C.text} sx={{ overflowWrap: 'anywhere' }}>
                              {promotion.name}
                            </Typography>

                            {promotion.description && (
                              <Typography
                                fontSize={12}
                                color={C.muted}
                                sx={{
                                  mt: 0.5,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  display: '-webkit-box',
                                  WebkitLineClamp: 2,
                                  WebkitBoxOrient: 'vertical'
                                }}
                              >
                                {promotion.description}
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell>
                            <Typography fontSize={13} fontWeight={700} color={C.text}>
                              {discountText(promotion)}
                            </Typography>

                            {promotion.discountType === 'PERCENT' && promotion.maxDiscountAmount != null && (
                              <Typography fontSize={11} color={C.muted} sx={{ mt: 0.4 }}>
                                Tối đa {money(promotion.maxDiscountAmount)}
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell>
                            <Typography fontSize={12}>{dateText(promotion.startDate)}</Typography>

                            <Typography fontSize={12} color={C.muted} sx={{ mt: 0.4 }}>
                              đến {dateText(promotion.endDate)}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Chip
                              size="small"
                              label={status.label}
                              color={status.color}
                              variant={status.color === 'default' ? 'outlined' : 'filled'}
                              sx={{
                                fontSize: 11,
                                maxWidth: '100%'
                              }}
                            />
                          </TableCell>

                          <TableCell align="right">
                            <Stack direction="row" spacing={0.25} justifyContent="flex-end" alignItems="center">
                              <Button
                                size="small"
                                title="Xem chi tiết"
                                aria-label="Xem chi tiết"
                                onClick={() => openDetail(promotion)}
                                sx={{
                                  minWidth: 32,
                                  px: 0.5,
                                  color: C.text
                                }}
                              >
                                <EyeOutlined />
                              </Button>

                              <Button
                                size="small"
                                title="Chỉnh sửa"
                                aria-label="Chỉnh sửa"
                                disabled
                                sx={{
                                  minWidth: 32,
                                  px: 0.5,
                                  color: '#267D89'
                                }}
                              >
                                <EditOutlined />
                              </Button>

                              <Button
                                size="small"
                                onClick={() => setStatusTarget(promotion)}
                                sx={{
                                  minWidth: 0,
                                  px: 0.75,
                                  fontSize: 11,
                                  color: promotion.status === 'ACTIVE' ? '#A66A00' : '#267D53'
                                }}
                              >
                                {promotion.status === 'ACTIVE' ? 'Tắt' : 'Bật'}
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Pagination */}
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                px: 2,
                py: 1.5,
                borderTop: `1px solid ${C.border}`,
                minHeight: 54,
                gap: 1,
                flexWrap: 'wrap'
              }}
            >
              <Typography fontSize={12} color={C.muted}>
                Hiển thị {filtered.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} /{' '}
                {filtered.length} khuyến mãi
              </Typography>

              <Pagination
                count={pageCount}
                page={currentPage}
                onChange={(_, value) => setPage(value)}
                size="small"
                shape="rounded"
                sx={{
                  '& .MuiPaginationItem-root.Mui-selected': {
                    bgcolor: C.cyan,
                    color: C.text
                  },
                  '& .MuiPaginationItem-root.Mui-selected:hover': {
                    bgcolor: C.cyanHover
                  }
                }}
              />
            </Box>
          </>
        )}
      </Card>

      {/* Promotion detail */}
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} fullWidth maxWidth="sm">
        <DialogTitle sx={{ fontWeight: 700, color: C.text }}>Chi tiết khuyến mãi</DialogTitle>

        <DialogContent dividers>
          {detail && (
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <Box>
                <Typography fontSize={12} color={C.muted}>
                  Tên khuyến mãi
                </Typography>
                <Typography fontWeight={600}>{detail.name}</Typography>
              </Box>

              <Box>
                <Typography fontSize={12} color={C.muted}>
                  Mô tả
                </Typography>
                <Typography>{detail.description || 'Không có mô tả'}</Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography fontSize={12} color={C.muted}>
                    Mức giảm
                  </Typography>
                  <Typography fontWeight={600}>{discountText(detail)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={C.muted}>
                    Đơn tối thiểu
                  </Typography>
                  <Typography>{money(detail.minOrderValue)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={C.muted}>
                    Mức giảm tối đa
                  </Typography>
                  <Typography>{detail.maxDiscountAmount == null ? 'Không giới hạn' : money(detail.maxDiscountAmount)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={C.muted}>
                    Lượt sử dụng tối đa
                  </Typography>
                  <Typography>
                    {detail.usageLimit == null ? 'Không giới hạn' : Number(detail.usageLimit).toLocaleString('vi-VN')}
                  </Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={C.muted}>
                    Ngày bắt đầu
                  </Typography>
                  <Typography>{dateText(detail.startDate)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={C.muted}>
                    Ngày kết thúc
                  </Typography>
                  <Typography>{dateText(detail.endDate)}</Typography>
                </Grid>

                <Grid item xs={12}>
                  <Typography fontSize={12} color={C.muted}>
                    Trạng thái
                  </Typography>
                  <Chip size="small" label={statusOf(detail).label} />
                </Grid>
              </Grid>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDetail(null)}>Đóng</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm status change */}
      <Dialog open={Boolean(statusTarget)} onClose={() => !changingStatus && setStatusTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>{statusTarget?.status === 'ACTIVE' ? 'Tắt khuyến mãi?' : 'Bật khuyến mãi?'}</DialogTitle>

        <DialogContent>
          <Typography fontSize={14}>
            Bạn muốn {statusTarget?.status === 'ACTIVE' ? 'tắt' : 'bật'} chương trình <strong>{statusTarget?.name}</strong>?
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setStatusTarget(null)} disabled={changingStatus}>
            Hủy
          </Button>

          <Button variant="contained" onClick={handleStatusChange} disabled={changingStatus} sx={buttonSx}>
            {changingStatus ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

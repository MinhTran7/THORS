import { useEffect, useMemo, useState } from 'react';
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
import { EditOutlined, EyeOutlined, SearchOutlined, TagsOutlined } from '@ant-design/icons';

import { changePromotionStatus, getPromotionById, getPromotions, updatePromotion } from 'services/promotionService';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  yellowLight: '#FFFBE7'
};

const PAGE_SIZE = 8;

const EMPTY_FORM = {
  name: '',
  description: '',
  discountType: 'PERCENT',
  discountValue: '',
  minOrderValue: '0',
  maxDiscountAmount: '',
  usageLimit: '',
  startDate: '',
  endDate: ''
};

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  boxShadow: 'none',
  bgcolor: '#fff'
};

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} đ`;

const dateText = (value) => (value ? new Date(`${value}T00:00:00`).toLocaleDateString('vi-VN') : '—');

const usageLimitText = (value) => (value == null || value === '' ? 'Không giới hạn' : Number(value).toLocaleString('vi-VN'));

function displayStatus(promotion) {
  const now = new Date();

  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');

  if (promotion.status !== 'ACTIVE') {
    return { label: 'Đã tắt', color: 'default' };
  }

  if (today < promotion.startDate) {
    return { label: 'Sắp diễn ra', color: 'info' };
  }

  if (today > promotion.endDate) {
    return { label: 'Đã kết thúc', color: 'default' };
  }

  return { label: 'Đang diễn ra', color: 'success' };
}

function discountText(promotion) {
  return promotion.discountType === 'PERCENT' ? `${Number(promotion.discountValue)}%` : money(promotion.discountValue);
}

export default function PromotionPage() {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [statusTarget, setStatusTarget] = useState(null);
  const [changingStatus, setChangingStatus] = useState(false);

  async function loadPromotions() {
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
  }

  useEffect(() => {
    loadPromotions();
  }, []);

  const filteredPromotions = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase('vi-VN');

    return promotions.filter((promotion) => {
      const searchableText = [promotion.name || '', promotion.description || ''].join(' ').toLocaleLowerCase('vi-VN');

      const matchesSearch = searchableText.includes(keyword);
      const status = displayStatus(promotion);

      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && promotion.status === 'ACTIVE') ||
        (statusFilter === 'INACTIVE' && promotion.status === 'INACTIVE') ||
        (statusFilter === 'ONGOING' && status.label === 'Đang diễn ra') ||
        (statusFilter === 'UPCOMING' && status.label === 'Sắp diễn ra') ||
        (statusFilter === 'ENDED' && status.label === 'Đã kết thúc');

      return matchesSearch && matchesStatus;
    });
  }, [promotions, search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filteredPromotions.length / PAGE_SIZE));

  const currentPage = Math.min(page, pageCount);

  const rows = filteredPromotions.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeCount = promotions.filter((promotion) => promotion.status === 'ACTIVE').length;

  const ongoingCount = promotions.filter((promotion) => displayStatus(promotion).label === 'Đang diễn ra').length;

  function updateForm(field, value) {
    setForm((previous) => ({
      ...previous,
      [field]: value
    }));
  }

  async function openDetail(promotion) {
    try {
      const data = await getPromotionById(promotion.promotionId);
      setDetail(data);
      setError('');
    } catch (e) {
      setError(e?.message || 'Không tải được chi tiết khuyến mãi.');
    }
  }

  function openEdit(promotion) {
    setForm({
      name: promotion.name || '',
      description: promotion.description || '',
      discountType: promotion.discountType || 'PERCENT',
      discountValue: String(promotion.discountValue ?? ''),
      minOrderValue: String(promotion.minOrderValue ?? 0),
      maxDiscountAmount: promotion.maxDiscountAmount == null ? '' : String(promotion.maxDiscountAmount),
      usageLimit: promotion.usageLimit == null ? '' : String(promotion.usageLimit),
      startDate: promotion.startDate || '',
      endDate: promotion.endDate || ''
    });

    setFormError('');
    setEdit(promotion);
    setDetail(null);
  }

  async function handleSave(event) {
    event.preventDefault();

    if (!edit || saving) return;

    const usageLimit = form.usageLimit.trim() === '' ? null : Number(form.usageLimit);

    if (usageLimit !== null && (!Number.isInteger(usageLimit) || usageLimit < 1)) {
      setFormError('Giới hạn lượt sử dụng phải là số nguyên lớn hơn hoặc bằng 1, hoặc để trống.');
      return;
    }

    setSaving(true);
    setFormError('');

    try {
      await updatePromotion(edit.promotionId, {
        ...form,
        usageLimit
      });

      setEdit(null);
      setSuccess('Đã cập nhật khuyến mãi.');
      await loadPromotions();
    } catch (e) {
      setFormError(e?.message || 'Không thể cập nhật khuyến mãi.');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange() {
    if (!statusTarget || changingStatus) return;

    setChangingStatus(true);

    try {
      const nextStatus = statusTarget.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

      await changePromotionStatus(statusTarget.promotionId, nextStatus);

      setStatusTarget(null);
      setSuccess(nextStatus === 'ACTIVE' ? 'Đã bật khuyến mãi.' : 'Đã tắt khuyến mãi.');

      await loadPromotions();
    } catch (e) {
      setError(e?.message || 'Không thể đổi trạng thái khuyến mãi.');
    } finally {
      setChangingStatus(false);
    }
  }

  return (
    <Box sx={{ p: { xs: 1, md: 3 }, maxWidth: 1500, mx: 'auto' }}>
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={1}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography variant="h4" sx={{ color: COLORS.text, fontWeight: 600 }}>
            Quản lý khuyến mãi
          </Typography>

          <Typography sx={{ color: COLORS.muted, mt: 0.5 }}>Theo dõi ưu đãi và trạng thái áp dụng cho đơn hàng.</Typography>
        </Box>

        <Chip
          icon={<TagsOutlined />}
          label={`${promotions.length} chương trình`}
          sx={{
            bgcolor: COLORS.cyanLight,
            color: COLORS.text,
            fontWeight: 600
          }}
        />
      </Stack>

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

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid item xs={12} sm={6} md={4}>
          <Card sx={cardSx}>
            <CardContent>
              <Typography fontSize={12} color={COLORS.muted}>
                Tổng khuyến mãi
              </Typography>
              <Typography variant="h4" sx={{ color: COLORS.text, mt: 1 }}>
                {promotions.length}
              </Typography>
              <Typography fontSize={12} color={COLORS.muted}>
                Tất cả chương trình đã tạo
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ ...cardSx, bgcolor: COLORS.cyanLight }}>
            <CardContent>
              <Typography fontSize={12} color={COLORS.muted}>
                Đang bật
              </Typography>
              <Typography variant="h4" sx={{ color: COLORS.text, mt: 1 }}>
                {activeCount}
              </Typography>
              <Typography fontSize={12} color={COLORS.muted}>
                Đã được bật thủ công
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={4}>
          <Card sx={{ ...cardSx, bgcolor: COLORS.yellowLight }}>
            <CardContent>
              <Typography fontSize={12} color={COLORS.muted}>
                Đang diễn ra
              </Typography>
              <Typography variant="h4" sx={{ color: COLORS.text, mt: 1 }}>
                {ongoingCount}
              </Typography>
              <Typography fontSize={12} color={COLORS.muted}>
                Trong khoảng ngày áp dụng
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Card sx={cardSx}>
        <CardContent sx={{ p: 2.5 }}>
          <Grid container spacing={1.5}>
            <Grid item xs={12} md={8}>
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
                        marginRight: 10,
                        color: COLORS.muted
                      }}
                    />
                  )
                }}
              />
            </Grid>

            <Grid item xs={12} md={4}>
              <TextField
                select
                fullWidth
                size="small"
                label="Lọc trạng thái"
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value);
                  setPage(1);
                }}
              >
                <MenuItem value="ALL">Tất cả trạng thái</MenuItem>
                <MenuItem value="ACTIVE">Đã bật</MenuItem>
                <MenuItem value="INACTIVE">Đã tắt</MenuItem>
                <MenuItem value="ONGOING">Đang diễn ra</MenuItem>
                <MenuItem value="UPCOMING">Sắp diễn ra</MenuItem>
                <MenuItem value="ENDED">Đã kết thúc</MenuItem>
              </TextField>
            </Grid>
          </Grid>
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
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" sx={{ minWidth: 950 }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: '#F8FAFC' }}>
                    <TableCell>Tên khuyến mãi</TableCell>
                    <TableCell>Giảm giá</TableCell>
                    <TableCell>Đơn tối thiểu</TableCell>
                    <TableCell>Lượt sử dụng tối đa</TableCell>
                    <TableCell>Thời gian</TableCell>
                    <TableCell>Trạng thái</TableCell>
                    <TableCell align="right">Thao tác</TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 6, color: COLORS.muted }}>
                        Không có khuyến mãi phù hợp.
                      </TableCell>
                    </TableRow>
                  ) : (
                    rows.map((promotion) => {
                      const status = displayStatus(promotion);

                      return (
                        <TableRow hover key={promotion.promotionId}>
                          <TableCell>
                            <Typography fontWeight={600} color={COLORS.text}>
                              {promotion.name}
                            </Typography>
                            <Typography fontSize={12} color={COLORS.muted}>
                              {promotion.description || 'Không có mô tả'}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Typography fontWeight={600}>{discountText(promotion)}</Typography>

                            {promotion.discountType === 'PERCENT' && promotion.maxDiscountAmount != null && (
                              <Typography fontSize={11} color={COLORS.muted}>
                                Tối đa {money(promotion.maxDiscountAmount)}
                              </Typography>
                            )}
                          </TableCell>

                          <TableCell>{money(promotion.minOrderValue)}</TableCell>

                          <TableCell>{usageLimitText(promotion.usageLimit)}</TableCell>

                          <TableCell>
                            <Typography fontSize={12}>{dateText(promotion.startDate)}</Typography>
                            <Typography fontSize={12} color={COLORS.muted}>
                              đến {dateText(promotion.endDate)}
                            </Typography>
                          </TableCell>

                          <TableCell>
                            <Stack spacing={0.5} alignItems="flex-start">
                              <Chip
                                size="small"
                                label={status.label}
                                color={status.color}
                                variant={status.color === 'default' ? 'outlined' : 'filled'}
                              />
                              <Typography fontSize={11} color={COLORS.muted}>
                                {promotion.status === 'ACTIVE' ? 'Đã bật' : 'Tắt thủ công'}
                              </Typography>
                            </Stack>
                          </TableCell>

                          <TableCell align="right">
                            <Stack direction="row" justifyContent="flex-end" spacing={0.5}>
                              <Button size="small" startIcon={<EyeOutlined />} onClick={() => openDetail(promotion)}>
                                Chi tiết
                              </Button>

                              <Button size="small" startIcon={<EditOutlined />} onClick={() => openEdit(promotion)}>
                                Sửa
                              </Button>

                              <Button
                                size="small"
                                color={promotion.status === 'ACTIVE' ? 'warning' : 'success'}
                                onClick={() => setStatusTarget(promotion)}
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

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems="center"
              spacing={2}
              sx={{ px: 2.5, py: 1.5 }}
            >
              <Typography fontSize={12} color={COLORS.muted}>
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
                  '& .Mui-selected': {
                    bgcolor: `${COLORS.cyan} !important`,
                    color: COLORS.text
                  }
                }}
              />
            </Stack>
          </>
        )}
      </Card>

      {/* Promotion detail */}
      <Dialog open={Boolean(detail)} onClose={() => setDetail(null)} fullWidth maxWidth="sm">
        <DialogTitle>Chi tiết khuyến mãi</DialogTitle>

        <DialogContent>
          {detail && (
            <Stack spacing={2} sx={{ mt: 1 }}>
              <Box>
                <Typography fontSize={12} color={COLORS.muted}>
                  Tên khuyến mãi
                </Typography>
                <Typography fontWeight={600}>{detail.name}</Typography>
              </Box>

              <Box>
                <Typography fontSize={12} color={COLORS.muted}>
                  Mô tả
                </Typography>
                <Typography>{detail.description || '—'}</Typography>
              </Box>

              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography fontSize={12} color={COLORS.muted}>
                    Mức giảm
                  </Typography>
                  <Typography fontWeight={600}>{discountText(detail)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={COLORS.muted}>
                    Đơn tối thiểu
                  </Typography>
                  <Typography>{money(detail.minOrderValue)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={COLORS.muted}>
                    Giảm tối đa
                  </Typography>
                  <Typography>{detail.maxDiscountAmount == null ? 'Không giới hạn' : money(detail.maxDiscountAmount)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={COLORS.muted}>
                    Lượt sử dụng tối đa
                  </Typography>
                  <Typography>{usageLimitText(detail.usageLimit)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={COLORS.muted}>
                    Trạng thái
                  </Typography>
                  <Chip size="small" label={displayStatus(detail).label} />
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={COLORS.muted}>
                    Ngày bắt đầu
                  </Typography>
                  <Typography>{dateText(detail.startDate)}</Typography>
                </Grid>

                <Grid item xs={6}>
                  <Typography fontSize={12} color={COLORS.muted}>
                    Ngày kết thúc
                  </Typography>
                  <Typography>{dateText(detail.endDate)}</Typography>
                </Grid>
              </Grid>
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDetail(null)}>Đóng</Button>

          {detail && (
            <Button
              variant="contained"
              onClick={() => openEdit(detail)}
              sx={{
                bgcolor: COLORS.cyan,
                color: COLORS.text,
                '&:hover': { bgcolor: '#6DDDE9' }
              }}
            >
              Chỉnh sửa
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* Edit promotion */}
      <Dialog open={Boolean(edit)} onClose={() => !saving && setEdit(null)} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={handleSave}>
          <DialogTitle>Chỉnh sửa khuyến mãi</DialogTitle>

          <DialogContent>
            <Stack spacing={2} sx={{ mt: 1 }}>
              {formError && <Alert severity="error">{formError}</Alert>}

              <TextField
                required
                label="Tên khuyến mãi"
                value={form.name}
                inputProps={{ maxLength: 100 }}
                onChange={(event) => updateForm('name', event.target.value)}
              />

              <TextField
                label="Mô tả"
                multiline
                minRows={2}
                value={form.description}
                inputProps={{ maxLength: 255 }}
                onChange={(event) => updateForm('description', event.target.value)}
              />

              <TextField
                select
                required
                label="Loại giảm giá"
                value={form.discountType}
                onChange={(event) => updateForm('discountType', event.target.value)}
              >
                <MenuItem value="PERCENT">Theo phần trăm (%)</MenuItem>
                <MenuItem value="FIXED">Số tiền cố định (VNĐ)</MenuItem>
              </TextField>

              <TextField
                required
                type="number"
                label={form.discountType === 'PERCENT' ? 'Phần trăm giảm' : 'Số tiền giảm (VNĐ)'}
                value={form.discountValue}
                inputProps={{
                  min: 0,
                  max: form.discountType === 'PERCENT' ? 100 : undefined,
                  step: form.discountType === 'PERCENT' ? '0.01' : '1'
                }}
                onChange={(event) => updateForm('discountValue', event.target.value)}
              />

              <TextField
                required
                type="number"
                label="Giá trị đơn hàng tối thiểu (VNĐ)"
                value={form.minOrderValue}
                inputProps={{ min: 0, step: 1 }}
                onChange={(event) => updateForm('minOrderValue', event.target.value)}
              />

              <TextField
                type="number"
                label="Giới hạn lượt sử dụng"
                value={form.usageLimit}
                inputProps={{ min: 1, step: 1 }}
                helperText="Để trống nếu không giới hạn số lượt sử dụng."
                onChange={(event) => updateForm('usageLimit', event.target.value)}
              />

              {form.discountType === 'PERCENT' && (
                <TextField
                  type="number"
                  label="Mức giảm tối đa (VNĐ, để trống nếu không giới hạn)"
                  value={form.maxDiscountAmount}
                  inputProps={{ min: 0, step: 1 }}
                  onChange={(event) => updateForm('maxDiscountAmount', event.target.value)}
                />
              )}

              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    required
                    type="date"
                    label="Ngày bắt đầu"
                    InputLabelProps={{ shrink: true }}
                    value={form.startDate}
                    onChange={(event) => updateForm('startDate', event.target.value)}
                  />
                </Grid>

                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    required
                    type="date"
                    label="Ngày kết thúc"
                    InputLabelProps={{ shrink: true }}
                    value={form.endDate}
                    onChange={(event) => updateForm('endDate', event.target.value)}
                  />
                </Grid>
              </Grid>

              <Alert severity="info">Trạng thái bật/tắt được quản lý riêng. Cập nhật thông tin không tự thay đổi trạng thái.</Alert>
            </Stack>
          </DialogContent>

          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setEdit(null)} disabled={saving}>
              Hủy
            </Button>

            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              sx={{
                bgcolor: COLORS.cyan,
                color: COLORS.text,
                '&:hover': { bgcolor: '#6DDDE9' }
              }}
            >
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {/* Confirm status change */}
      <Dialog open={Boolean(statusTarget)} onClose={() => !changingStatus && setStatusTarget(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{statusTarget?.status === 'ACTIVE' ? 'Tắt khuyến mãi?' : 'Bật khuyến mãi?'}</DialogTitle>

        <DialogContent>
          <Typography fontSize={14}>
            Bạn muốn {statusTarget?.status === 'ACTIVE' ? 'tắt' : 'bật'} chương trình <strong>{statusTarget?.name}</strong>?
          </Typography>

          {statusTarget?.status === 'ACTIVE' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              Khách hàng sẽ không thể áp dụng khuyến mãi này cho đơn mới khi chương trình bị tắt. Đơn hàng đã chốt vẫn giữ thông tin giảm
              giá cũ.
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setStatusTarget(null)} disabled={changingStatus}>
            Hủy
          </Button>

          <Button
            variant="contained"
            color={statusTarget?.status === 'ACTIVE' ? 'warning' : 'success'}
            onClick={handleStatusChange}
            disabled={changingStatus}
          >
            {changingStatus ? 'Đang xử lý...' : 'Xác nhận'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

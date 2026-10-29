import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Typography,
  Stack,
  Button,
  Card,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Pagination,
  TextField,
  InputAdornment,
  Alert,
  CircularProgress,
  Tooltip,
  Divider,
  Paper
} from '@mui/material';
import {
  SearchOutlined,
  PlusOutlined,
  RollbackOutlined,
  EyeOutlined,
  ExperimentOutlined,
  SyncOutlined,
  AuditOutlined,
  DollarCircleOutlined
} from '@ant-design/icons';
import { getReturnRequests, getReturnRequestById, seedSampleOrder } from '../../services/returnService';
import CreateReturnDialog from './CreateReturnDialog';
import ReturnDetailDialog from './ReturnDetailDialog';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  green: '#25856A',
  red: '#D04D4D',
  yellow: '#E59A00'
};

const PAGE_SIZE = 8;

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  boxShadow: 'none',
  bgcolor: '#FFFFFF'
};

function formatPrice(val) {
  if (val == null) return '0 ₫';
  return `${Number(val).toLocaleString('vi-VN')} ₫`;
}

function getStatusChip(status) {
  switch (status) {
    case 'PENDING':
      return <Chip size="small" label="Chờ xử lý" sx={{ bgcolor: '#FFF7E6', color: COLORS.yellow, fontWeight: 700, fontSize: 11 }} />;
    case 'APPROVED':
      return <Chip size="small" label="Đã duyệt" sx={{ bgcolor: '#EAFBFD', color: '#0E7A88', fontWeight: 700, fontSize: 11 }} />;
    case 'RECEIVED':
      return <Chip size="small" label="Đã nhận hàng" sx={{ bgcolor: '#E8F6F0', color: COLORS.green, fontWeight: 700, fontSize: 11 }} />;
    case 'COMPLETED':
      return <Chip size="small" label="Đã hoàn tất" sx={{ bgcolor: '#E8F6F0', color: COLORS.green, fontWeight: 700, fontSize: 11 }} />;
    case 'REJECTED':
      return <Chip size="small" label="Đã từ chối" sx={{ bgcolor: '#FCECEC', color: COLORS.red, fontWeight: 700, fontSize: 11 }} />;
    default:
      return <Chip size="small" label={status} sx={{ fontSize: 11 }} />;
  }
}

export default function ReturnsPage() {
  const [returnList, setReturnList] = useState([]);
  const [totalElements, setTotalElements] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filters
  const [activeTab, setActiveTab] = useState('ALL');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const res = await getReturnRequests({
        status: activeTab,
        search,
        page,
        pageSize: PAGE_SIZE
      });

      setReturnList(res.content || []);
      setTotalElements(res.totalElements || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Failed to load return requests:', err);
      setError(err?.message || 'Không thể tải danh sách hoàn hàng.');
    } finally {
      setLoading(false);
    }
  }, [activeTab, search, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSeedSampleOrder = async () => {
    try {
      setSeeding(true);
      setError('');
      setSuccess('');

      const res = await seedSampleOrder();
      setSuccess(`Đã tạo đơn hàng mẫu ${res.orderNumber} thành công! Bạn có thể dùng mã này để tạo phiếu hoàn hàng ngay.`);
    } catch (err) {
      console.error('Seed sample order failed:', err);
      setError(err?.message || 'Không thể tạo đơn hàng mẫu.');
    } finally {
      setSeeding(false);
    }
  };

  const handleOpenDetail = async (item) => {
    setSelectedReturn(item);
    setDetailDialogOpen(true);
    try {
      const full = await getReturnRequestById(item.returnRequestId);
      setSelectedReturn(full);
    } catch (err) {
      console.error('Failed to load full return details:', err);
    }
  };

  const tabs = [
    { key: 'ALL', label: 'Tất cả' },
    { key: 'PENDING', label: 'Chờ xử lý' },
    { key: 'APPROVED', label: 'Đã duyệt' },
    { key: 'RECEIVED', label: 'Đã nhận hàng' },
    { key: 'COMPLETED', label: 'Đã hoàn tất' },
    { key: 'REJECTED', label: 'Đã từ chối' }
  ];

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', p: { xs: 2, sm: 3 } }}>
      {/* HEADER */}
      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography sx={{ fontSize: { xs: 24, md: 28 }, fontWeight: 700, color: COLORS.text }}>
            Quản lý đổi trả & hoàn hàng
          </Typography>
          <Typography fontSize={13} color={COLORS.muted} sx={{ mt: 0.5 }}>
            Theo dõi các yêu cầu đổi trả của khách hàng, phê duyệt, nhận hàng và tự động cập nhật lại tồn kho.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Tooltip title="Tạo 1 đơn hàng test (COMPLETED) để thử nghiệm chức năng hoàn hàng ngay lập tức">
            <span>
              <Button
                variant="outlined"
                disabled={seeding || loading}
                startIcon={seeding ? <CircularProgress size={16} /> : <ExperimentOutlined />}
                onClick={handleSeedSampleOrder}
                sx={{
                  textTransform: 'none',
                  fontWeight: 600,
                  borderColor: COLORS.muted,
                  color: COLORS.text
                }}
              >
                {seeding ? 'Đang tạo...' : 'Tạo đơn mẫu (Test)'}
              </Button>
            </span>
          </Tooltip>

          <Button
            variant="contained"
            startIcon={<PlusOutlined />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{
              bgcolor: COLORS.cyan,
              color: COLORS.text,
              textTransform: 'none',
              fontWeight: 700,
              boxShadow: 'none',
              '&:hover': { bgcolor: '#6DDDE9', boxShadow: 'none' }
            }}
          >
            Tạo yêu cầu hoàn hàng
          </Button>
        </Stack>
      </Stack>

      {/* ALERTS */}
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

      {/* QUICK TABS */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2.5 }}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.key;
          return (
            <Button
              key={tab.key}
              variant="outlined"
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
              sx={{
                textTransform: 'none',
                borderColor: selected ? COLORS.cyan : COLORS.border,
                bgcolor: selected ? COLORS.cyan : '#FFFFFF',
                color: COLORS.text,
                fontWeight: selected ? 700 : 500,
                fontSize: 12,
                px: 2,
                '&:hover': { bgcolor: COLORS.cyanLight, borderColor: COLORS.cyan }
              }}
            >
              {tab.label}
            </Button>
          );
        })}
      </Stack>

      {/* SEARCH BAR */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5 }}>
        <TextField
          size="small"
          fullWidth
          placeholder="Tìm kiếm theo mã phiếu, mã đơn hàng, tên khách hàng hoặc SĐT..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined />
                </InputAdornment>
              )
            }
          }}
          sx={{ bgcolor: '#FFFFFF', '& .MuiOutlinedInput-root': { borderRadius: 1.5 } }}
        />
        <Button
          variant="outlined"
          startIcon={<SyncOutlined />}
          onClick={loadData}
          sx={{ textTransform: 'none', minWidth: 100, borderColor: COLORS.border, color: COLORS.text }}
        >
          Làm mới
        </Button>
      </Stack>

      {/* DATA TABLE */}
      <Card sx={cardSx}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 950, '& .MuiTableCell-root': { borderColor: COLORS.border } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F7F9FC' }}>
                {['Mã yêu cầu', 'Mã đơn hàng', 'Khách hàng', 'Lý do', 'Loại', 'Tiền hoàn', 'Ngày yêu cầu', 'Trạng thái', 'Thao tác'].map((label) => (
                  <TableCell
                    key={label}
                    align={label === 'Thao tác' ? 'center' : label === 'Tiền hoàn' ? 'right' : 'left'}
                    sx={{ fontSize: 11, fontWeight: 600, color: COLORS.muted, py: 1.75 }}
                  >
                    {label.toUpperCase()}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Stack alignItems="center" spacing={1}>
                      <CircularProgress size={28} />
                      <Typography fontSize={12} color={COLORS.muted}>
                        Đang tải danh sách đổi trả...
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}

              {!loading && returnList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                      Chưa có yêu cầu hoàn hàng nào
                    </Typography>
                    <Typography fontSize={11} color={COLORS.muted} sx={{ mt: 1 }}>
                      Bấm &quot;Tạo đơn mẫu (Test)&quot; và &quot;Tạo yêu cầu hoàn hàng&quot; để trải nghiệm tính năng.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                returnList.map((row) => (
                  <TableRow
                    key={row.returnRequestId}
                    hover
                    sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                    onClick={() => handleOpenDetail(row)}
                  >
                    <TableCell>
                      <Typography fontSize={12} fontWeight={700} color={COLORS.text}>
                        #{row.returnRequestId}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography fontSize={12} fontWeight={600} color="#0E7A88">
                        {row.orderNumber}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography fontSize={12} fontWeight={600} color={COLORS.text}>
                        {row.customerName || 'Khách vãng lai'}
                      </Typography>
                      {row.customerPhone && (
                        <Typography fontSize={11} color={COLORS.muted}>
                          {row.customerPhone}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell sx={{ maxWidth: 200 }}>
                      <Typography fontSize={12} color={COLORS.text} noWrap>
                        {row.reason}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={row.requestType === 'EXCHANGE' ? 'Đổi hàng' : 'Trả hàng'}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: 10, height: 22 }}
                      />
                    </TableCell>

                    <TableCell align="right">
                      <Typography fontSize={12} fontWeight={700} color={COLORS.green}>
                        {formatPrice(row.totalRefundAmount)}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography fontSize={11} color={COLORS.muted}>
                        {row.requestedAt ? new Date(row.requestedAt).toLocaleDateString('vi-VN') : '—'}
                      </Typography>
                    </TableCell>

                    <TableCell>{getStatusChip(row.status)}</TableCell>

                    <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                      {row.status === 'PENDING' ? (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<AuditOutlined />}
                          onClick={() => handleOpenDetail(row)}
                          sx={{
                            textTransform: 'none',
                            fontSize: 11,
                            fontWeight: 700,
                            bgcolor: '#0E7A88',
                            color: '#FFFFFF',
                            boxShadow: 'none',
                            '&:hover': { bgcolor: '#095B66' }
                          }}
                        >
                          Duyệt đơn
                        </Button>
                      ) : row.status === 'APPROVED' || row.status === 'RECEIVED' ? (
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<DollarCircleOutlined />}
                          onClick={() => handleOpenDetail(row)}
                          sx={{
                            textTransform: 'none',
                            fontSize: 11,
                            fontWeight: 700,
                            bgcolor: COLORS.green,
                            color: '#FFFFFF',
                            boxShadow: 'none',
                            '&:hover': { bgcolor: '#1E6B55' }
                          }}
                        >
                          Nhập kho
                        </Button>
                      ) : (
                        <Button
                          size="small"
                          startIcon={<EyeOutlined />}
                          onClick={() => handleOpenDetail(row)}
                          sx={{ textTransform: 'none', fontSize: 11, color: COLORS.text }}
                        >
                          Chi tiết
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider />

        {/* PAGINATION */}
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems="center" spacing={2} sx={{ px: 2, py: 1.5 }}>
          <Typography fontSize={11} color={COLORS.muted}>
            Tổng cộng: {totalElements} yêu cầu hoàn hàng
          </Typography>

          <Pagination
            count={totalPages}
            page={page}
            onChange={(_, val) => setPage(val)}
            size="small"
            shape="rounded"
            sx={{
              '& .Mui-selected': { bgcolor: `${COLORS.cyan} !important`, color: COLORS.text }
            }}
          />
        </Stack>
      </Card>

      {/* DIALOGS */}
      <CreateReturnDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={(msg) => {
          setSuccess(msg);
          loadData();
        }}
      />

      <ReturnDetailDialog
        open={detailDialogOpen}
        onClose={() => setDetailDialogOpen(false)}
        returnData={selectedReturn}
        onProcessed={(msg) => {
          setSuccess(msg);
          loadData();
        }}
      />
    </Box>
  );
}


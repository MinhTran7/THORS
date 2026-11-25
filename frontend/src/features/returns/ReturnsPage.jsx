import { useState, useEffect, useCallback } from 'react';
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
  TextField,
  InputAdornment,
  Alert,
  CircularProgress,
  Tooltip,
  Divider,
  Tab,
  Tabs
} from '@mui/material';
import { FilterField, FilterResetButton, filterInputSx, Pager, Toolbar } from 'features/account/components/Blocks';
import { useDebounced } from 'features/account/hooks';
import { brand, cardSx as panelSx } from 'features/account/tokens';
import { PAGE_TYPE, pageSubtitleSx, pageTitleSx } from 'themes/pageType';
import {
  SearchOutlined,
  PlusOutlined,
  EyeOutlined,
  ExperimentOutlined,
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
  // Gõ xong mới tìm (giống trang Đơn hàng online), không gọi API sau mỗi phím
  const query = useDebounced(search.trim());
  const [page, setPage] = useState(1);

  // Dialogs
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedReturn, setSelectedReturn] = useState(null);
  const [seeding, setSeeding] = useState(false);

  // silent = tải lại nền (định kỳ / quay lại tab): không hiện vòng quay, lỗi mạng thoáng qua thì bỏ qua
  const loadData = useCallback(async (silent = false) => {
    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }

      const res = await getReturnRequests({
        status: activeTab,
        search: query,
        page,
        pageSize: PAGE_SIZE
      });

      setReturnList(res.content || []);
      setTotalElements(res.totalElements || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      console.error('Failed to load return requests:', err);
      if (!silent) setError(err?.message || 'Không thể tải danh sách hoàn hàng.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [activeTab, query, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Không còn nút "Làm mới": danh sách tự tải lại khi quay lại tab và định kỳ khi tab đang mở (giống Đơn hàng online)
  useEffect(() => {
    const refresh = () => document.visibilityState === 'visible' && loadData(true);
    const timer = setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
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
          <Typography variant="h3" sx={{ ...pageTitleSx, color: COLORS.text }}>
            Quản lý đổi trả & hoàn hàng
          </Typography>
          <Typography color={COLORS.muted} sx={{ ...pageSubtitleSx, mt: 0.75 }}>
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
            Đổi trả tại quầy
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

      {/* TAB TRẠNG THÁI: cùng kiểu trang Đơn hàng online (thẻ trắng, gạch chân cyan, các tab giãn đều) */}
      <Box sx={{ ...panelSx, p: 0.5, mb: 2, bgcolor: brand.surface, borderRadius: '12px' }}>
        <Tabs
          value={activeTab}
          onChange={(_, value) => {
            setActiveTab(value);
            setPage(1);
          }}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          aria-label="Lọc yêu cầu đổi trả theo trạng thái"
          sx={{
            minHeight: 44,
            '& .MuiTabs-indicator': { bgcolor: brand.cyan, height: 3, borderRadius: '3px 3px 0 0' },
            '& .MuiTab-root': {
              minHeight: 44,
              py: 1.25,
              px: { xs: 1.5, sm: 2.25 },
              textTransform: 'none',
              fontWeight: 600,
              fontSize: 14,
              color: brand.muted,
              transition: 'color 0.2s ease',
              '&.Mui-selected': { color: brand.ink, fontWeight: 700 },
              '&:hover': { color: brand.ink }
            }
          }}
        >
          {tabs.map((tab) => (
            <Tab key={tab.key} value={tab.key} label={tab.label} sx={{ flex: 1, minWidth: { xs: 100, sm: 120 } }} />
          ))}
        </Tabs>
      </Box>

      {/* THANH TÌM KIẾM: cùng kiểu thanh lọc trang Đơn hàng online (nhãn nằm trên ô, cao 44) */}
      <Toolbar>
        <Box sx={{ flex: 1, display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 1.5 }}>
          <FilterField label="Tìm kiếm" grow>
            <TextField
              fullWidth
              size="small"
              placeholder="Tìm theo mã phiếu, mã đơn hàng, tên khách hàng hoặc SĐT..."
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
                },
                htmlInput: { 'aria-label': 'Tìm kiếm yêu cầu đổi trả' }
              }}
              sx={filterInputSx()}
            />
          </FilterField>
          <FilterResetButton
            disabled={!search}
            onClick={() => {
              setSearch('');
              setPage(1);
            }}
          />
        </Box>
      </Toolbar>

      {/* DATA TABLE */}
      <Card sx={cardSx}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table sx={{ minWidth: 950, '& .MuiTableCell-root': { borderColor: COLORS.border } }}>
            <TableHead>
              <TableRow sx={{ bgcolor: '#F7F9FC' }}>
                {['STT', 'Mã yêu cầu', 'Mã đơn hàng', 'Khách hàng', 'Lý do', 'Loại', 'Tiền hoàn', 'Ngày yêu cầu', 'Trạng thái', 'Thao tác'].map((label) => (
                  <TableCell
                    key={label}
                    align={label === 'Thao tác' || label === 'STT' ? 'center' : label === 'Tiền hoàn' ? 'right' : 'left'}
                    sx={{ fontSize: PAGE_TYPE.th, fontWeight: 600, color: COLORS.muted, py: 1.75, ...(label === 'STT' ? { width: 56 } : {}) }}
                  >
                    {label.toUpperCase()}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <Stack alignItems="center" spacing={1}>
                      <CircularProgress size={28} />
                      <Typography fontSize={PAGE_TYPE.td} color={COLORS.muted}>
                        Đang tải danh sách đổi trả...
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}

              {!loading && returnList.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <Typography fontSize={PAGE_TYPE.td} fontWeight={600} color={COLORS.text}>
                      Chưa có yêu cầu hoàn hàng nào
                    </Typography>
                    <Typography fontSize={PAGE_TYPE.tdSub} color={COLORS.muted} sx={{ mt: 1 }}>
                      Bấm &quot;Tạo đơn mẫu (Test)&quot; và &quot;Tạo yêu cầu hoàn hàng&quot; để trải nghiệm tính năng.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                returnList.map((row, index) => (
                  <TableRow
                    key={row.returnRequestId}
                    hover
                    sx={{ cursor: 'pointer', '&:last-child td': { borderBottom: 0 } }}
                    onClick={() => handleOpenDetail(row)}
                  >
                    <TableCell align="center">
                      <Typography fontSize={PAGE_TYPE.td} color={COLORS.muted}>
                        {(page - 1) * PAGE_SIZE + index + 1}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography fontSize={PAGE_TYPE.td} fontWeight={700} color={COLORS.text}>
                        #{row.returnRequestId}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography fontSize={PAGE_TYPE.td} fontWeight={600} color="#0E7A88">
                        {row.orderNumber}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography fontSize={PAGE_TYPE.td} fontWeight={600} color={COLORS.text}>
                        {row.customerName || 'Khách vãng lai'}
                      </Typography>
                      {row.customerPhone && (
                        <Typography fontSize={PAGE_TYPE.tdSub} color={COLORS.muted}>
                          {row.customerPhone}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell sx={{ maxWidth: 200 }}>
                      <Typography fontSize={PAGE_TYPE.td} color={COLORS.text} noWrap>
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
                      <Typography fontSize={PAGE_TYPE.td} fontWeight={700} color={COLORS.green}>
                        {formatPrice(row.totalRefundAmount)}
                      </Typography>
                    </TableCell>

                    <TableCell>
                      <Typography fontSize={PAGE_TYPE.td} color={COLORS.muted}>
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
        <Pager
          page={page - 1}
          totalPages={totalPages}
          total={totalElements}
          size={PAGE_SIZE}
          noun="yêu cầu hoàn hàng"
          onPage={(p) => setPage(p + 1)}
        />
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


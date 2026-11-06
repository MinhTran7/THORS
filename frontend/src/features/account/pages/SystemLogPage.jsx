import { useState } from 'react';
import useSWR from 'swr';
import { Box, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { Stack } from '../components/Flex';
import { CheckCircleOutlined, CloseCircleOutlined, DownloadOutlined, FileTextOutlined, ReloadOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { downloadCsv } from 'utils/csv';
import { fetchAll, logsApi } from '../api';
import { LOG_STATUS, ROLE_LABEL } from '../constants';
import { formatLogDate, formatTime, humanize, parseUtc, toYmd, tzLabel, tzOffsetMinutes } from '../format';
import { useDebounced } from '../hooks';
import { brand, cardSx, fs } from '../tokens';
import { OutlineButton } from '../components/Brand';
import { StatusPill } from '../components/Chips';
import {
  EmptyRow,
  FilterSelect,
  PageHeader,
  Pager,
  SearchField,
  StatCard,
  StatRow,
  Toolbar,
  bodyCellSx,
  headCellSx
} from '../components/Blocks';
import { useToast } from '../components/Toast';

const ACTION_LABELS = {
  LOGIN: 'Đăng nhập',
  LOGIN_FAILED: 'Đăng nhập thất bại',
  LOGIN_FAILURE: 'Đăng nhập thất bại',
  LOGIN_LOCK: 'Tạm khóa đăng nhập do sai nhiều lần',
  ACCOUNT_CREATE: 'Tạo tài khoản',
  ACCOUNT_EDIT: 'Cập nhật tài khoản',
  ACCOUNT_LOCK: 'Khóa tài khoản',
  ACCOUNT_UNLOCK: 'Mở khóa tài khoản',
  ACCOUNT_ACTIVATE: 'Kích hoạt tài khoản',
  ACCOUNT_DEACTIVATE: 'Vô hiệu hóa tài khoản',
  PASSWORD_CHANGE: 'Đổi mật khẩu',
  PASSWORD_RESET: 'Đặt lại mật khẩu',
  PASSWORD_RESET_ADMIN: 'Quản lý đặt lại mật khẩu',
  PASSWORD_RESET_REQUEST: 'Yêu cầu đặt lại mật khẩu',
  PROFILE_UPDATE: 'Cập nhật hồ sơ',
  PHONE_ADDED: 'Thêm số điện thoại'
};

const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  ...Object.entries(LOG_STATUS).map(([value, meta]) => ({ value, label: meta.label }))
];

const RANGE_OPTIONS = [
  { value: '7d', label: '7 ngày qua' },
  { value: '30d', label: '30 ngày qua' },
  { value: 'all', label: 'Tất cả thời gian' },
  { value: 'custom', label: 'Tùy chọn ngày…' }
];

const daysAgo = (n) => {
  const today = new Date();
  return toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - n));
};

// "N ngày qua" tính cả hôm nay. Chuỗi rỗng = không giới hạn phía đó.
function presetRange(preset) {
  if (preset === '7d') return { from: daysAgo(6), to: daysAgo(0) };
  if (preset === '30d') return { from: daysAgo(29), to: daysAgo(0) };
  return { from: '', to: '' };
}

const dmy = (ymd) => ymd.split('-').reverse().join('/');

function rangeCaption(preset, from, to) {
  if (preset === 'custom') {
    if (from && to) return `Từ ${dmy(from)} đến ${dmy(to)}`;
    if (from) return `Từ ${dmy(from)} đến nay`;
    if (to) return `Đến hết ${dmy(to)}`;
    return 'Toàn bộ lịch sử';
  }
  return preset === 'all' ? 'Toàn bộ lịch sử' : `Trong ${RANGE_OPTIONS.find((o) => o.value === preset).label}`;
}

// Hàng thấp hơn mặc định để một trang 10 dòng đỡ phải cuộn.
const cellSx = { ...bodyCellSx, py: 1 };

// Trang này có thêm ba thẻ thống kê nên chỉ hiện 8 dòng mỗi trang để vừa một màn hình, không phải cuộn.
const LOG_PAGE_SIZE = 8;

const actionLabel = (item) => ACTION_LABELS[item.action] ?? humanize(item.action);

function subtitle(item) {
  const role = item.targetRole ? ROLE_LABEL[item.targetRole] : '';
  if (item.action === 'LOGIN_FAILED') return [item.newValue, role].filter(Boolean).join(' · ');
  return [item.targetName, role].filter(Boolean).join(' · ') || item.newValue || '';
}

export default function SystemLogPage() {
  useCrumbs(['Nhật ký hệ thống']);
  const [toast, showToast] = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [preset, setPreset] = useState('7d');
  // Chỉ dùng khi chọn "Tùy chọn ngày…"; các mốc nhanh tính lại mỗi lần render nên qua nửa đêm vẫn đúng.
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const { from, to } = preset === 'custom' ? { from: customFrom, to: customTo } : presetRange(preset);
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState(null);
  const search = useDebounced(q.trim());
  const offset = tzOffsetMinutes();

  const params = { q: search, status, from, to, offset, page, size: LOG_PAGE_SIZE };
  const list = useSWR(['system-log', params], () => logsApi.list(params), {
    keepPreviousData: true,
    revalidateOnFocus: false,
    onSuccess: () => setRefreshedAt(new Date())
  });
  const summaryParams = { from, to, offset };
  const summary = useSWR(['system-log-summary', summaryParams], () => logsApi.summary(summaryParams), {
    keepPreviousData: true,
    revalidateOnFocus: false
  });

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  // Chuyển sang "Tùy chọn ngày…" thì giữ nguyên khoảng đang xem làm điểm bắt đầu để sửa tiếp.
  const choosePreset = (value) => {
    if (value === 'custom' && preset !== 'custom') {
      setCustomFrom(from);
      setCustomTo(to);
    }
    filter(setPreset)(value);
  };

  const stats = summary.data;
  const successRate = stats && stats.events > 0 ? Math.round((stats.successful / stats.events) * 100) : 100;
  const caption = rangeCaption(preset, from, to);

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await fetchAll((paging) => logsApi.list({ q: search, status, from, to, offset, ...paging }));
      downloadCsv(
        'system-log.csv',
        ['Thời gian (UTC)', 'Người dùng', 'Hành động', 'Chi tiết', 'Địa chỉ IP', 'Trạng thái'],
        rows.map((item) => [
          parseUtc(item.performedAt)?.toISOString() ?? '',
          item.actorName ?? 'Hệ thống',
          actionLabel(item),
          subtitle(item),
          item.ip ?? '',
          LOG_STATUS[item.status]?.label ?? item.status
        ])
      );
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  const items = list.data?.items ?? [];
  const dateField = (label, value, setter) => (
    <TextField
      type="date"
      size="small"
      label={label}
      value={value}
      onChange={(event) => filter(setter)(event.target.value)}
      slotProps={{ inputLabel: { shrink: true } }}
      sx={{
        minWidth: 170,
        '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', fontSize: fs.body, '& fieldset': { borderColor: brand.line } }
      }}
    />
  );

  return (
    <Box>
      <PageHeader
        title="Nhật ký hệ thống"
        subtitle="Bản ghi đáng tin cậy về hoạt động quản lý tài khoản và bảo mật."
        action={
          <OutlineButton startIcon={<DownloadOutlined />} onClick={exportCsv} disabled={exporting} sx={{ fontSize: fs.body }}>
            {exporting ? 'Đang xuất…' : 'Xuất nhật ký'}
          </OutlineButton>
        }
      />
      <StatRow>
        <StatCard label="Tổng sự kiện" value={stats?.events} caption={caption} icon={<FileTextOutlined />} loading={!stats} />
        <StatCard
          label="Hành động thành công"
          value={stats?.successful}
          caption={`${successRate}% hoàn tất thành công`}
          icon={<CheckCircleOutlined />}
          loading={!stats}
        />
        <StatCard
          label="Hành động thất bại"
          value={stats?.failed}
          caption={stats ? `${stats.failedSignIns} lần đăng nhập sai · ${stats.pausedSignIns} lần tạm khóa đăng nhập` : ' '}
          icon={<CloseCircleOutlined />}
          warning={Boolean(stats?.failed)}
          loading={!stats}
        />
      </StatRow>

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Tìm người dùng, hành động hoặc địa chỉ IP" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Lọc theo trạng thái" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} minWidth={180} />
        <FilterSelect label="Khoảng thời gian" value={preset} onChange={choosePreset} options={RANGE_OPTIONS} minWidth={170} />
        {preset === 'custom' && (
          <>
            {dateField('Từ ngày', customFrom, setCustomFrom)}
            {dateField('Đến ngày', customTo, setCustomTo)}
          </>
        )}
      </Toolbar>

      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {list.error && (
          <Typography color="error" sx={{ p: 2, fontSize: fs.body }}>
            {list.error.message}
          </Typography>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          {/* tableLayout fixed + độ rộng cố định: cột không còn xê dịch theo nội dung của từng trang. */}
          <Table size="small" sx={{ minWidth: 960, tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                {[
                  ['Thời gian', 230],
                  ['Người dùng', 200],
                  ['Hành động', undefined],
                  ['Địa chỉ IP', 190],
                  ['Trạng thái', 150]
                ].map(([label, width]) => (
                  <TableCell key={label} sx={{ ...headCellSx, width }}>
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item) => {
                const meta = LOG_STATUS[item.status] ?? LOG_STATUS.SUCCESS;
                return (
                  <TableRow key={item.id} hover>
                    <TableCell sx={cellSx}>
                      <Typography sx={{ fontSize: fs.body, whiteSpace: 'nowrap' }}>
                        {formatLogDate(item.performedAt)}
                        <Box component="span" sx={{ color: brand.muted, ml: 1 }}>
                          {formatTime(item.performedAt)}
                        </Box>
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography noWrap sx={{ fontSize: fs.body }}>
                        {item.actorName ?? 'Hệ thống'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography noWrap title={`${actionLabel(item)} ${subtitle(item)}`} sx={{ fontSize: fs.body }}>
                        <Box component="span" sx={{ fontWeight: 600, color: brand.ink }}>
                          {actionLabel(item)}
                        </Box>
                        {subtitle(item) && (
                          <Box component="span" sx={{ color: brand.muted, fontSize: fs.caption, ml: 1 }}>
                            {subtitle(item)}
                          </Box>
                        )}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography noWrap title={item.ip ?? ''} sx={{ fontSize: fs.body }}>
                        {item.ip ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <StatusPill tone={meta.tone} label={meta.label} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && <EmptyRow colSpan={5}>Không có sự kiện nào khớp với bộ lọc.</EmptyRow>}
            </TableBody>
          </Table>
        </Box>
        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={LOG_PAGE_SIZE}
          noun="sự kiện"
          onPage={setPage}
        />
      </Box>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 1.5 }}>
        <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>
          {`Nhật ký chỉ để xem, không thể chỉnh sửa. Mọi thời gian theo ${tzLabel()}.${
            refreshedAt ? ` Làm mới lúc ${refreshedAt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}.` : ''
          }`}
        </Typography>
        <Tooltip title="Làm mới">
          <IconButton
            size="small"
            aria-label="Làm mới nhật ký"
            onClick={() => {
              list.mutate();
              summary.mutate();
            }}
          >
            <ReloadOutlined />
          </IconButton>
        </Tooltip>
      </Stack>
      {toast}
    </Box>
  );
}
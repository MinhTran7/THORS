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
  const today = new Date();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState(toYmd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)));
  const [to, setTo] = useState(toYmd(today));
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
  const summary = useSWR(['system-log-summary', offset], () => logsApi.summary(offset), { revalidateOnFocus: false });

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  const stats = summary.data;
  const successRate = stats && stats.eventsToday > 0 ? Math.round((stats.successfulToday / stats.eventsToday) * 100) : 100;

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
        <StatCard
          label="Sự kiện hôm nay"
          value={stats?.eventsToday}
          caption="Trên toàn bộ tài khoản hệ thống"
          icon={<FileTextOutlined />}
          loading={!stats}
        />
        <StatCard
          label="Hành động thành công"
          value={stats?.successfulToday}
          caption={`${successRate}% hoàn tất thành công`}
          icon={<CheckCircleOutlined />}
          loading={!stats}
        />
        <StatCard
          label="Hành động thất bại"
          value={stats?.failedToday}
          caption={stats ? `${stats.failedSignInsToday} lần đăng nhập sai · ${stats.pausedSignInsToday} lần tạm khóa đăng nhập` : ' '}
          icon={<CloseCircleOutlined />}
          warning={Boolean(stats?.failedToday)}
          loading={!stats}
        />
      </StatRow>

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Tìm người dùng, hành động hoặc địa chỉ IP" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Lọc theo trạng thái" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} minWidth={180} />
        {dateField('Từ ngày', from, setFrom)}
        {dateField('Đến ngày', to, setTo)}
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
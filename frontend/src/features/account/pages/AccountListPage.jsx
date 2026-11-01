import { useState } from 'react';
import useSWR from 'swr';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { Stack } from '../components/Flex';
import { DownloadOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { downloadCsv } from 'utils/csv';
import { accountsApi, fetchAll } from '../api';
import { ACCOUNT_STATUS, PAGE_SIZE, ROLE_LABEL } from '../constants';
import { formatDate } from '../format';
import { useDebounced } from '../hooks';
import { brand, cardSx, fs } from '../tokens';
import { OutlineButton } from '../components/Brand';
import { RoleChip, StatusPill } from '../components/Chips';
import { EmptyRow, FilterSelect, PageHeader, Pager, SearchField, bodyCellSx, headCellSx } from '../components/Blocks';
import ResetPasswordDialog from '../components/ResetPasswordDialog';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';

const ROLE_OPTIONS = [{ value: '', label: 'Tất cả vai trò' }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))];
const STATUS_OPTIONS = [
  { value: '', label: 'Tất cả trạng thái' },
  ...Object.entries(ACCOUNT_STATUS).map(([value, meta]) => ({ value, label: meta.label }))
];

// Hàng thấp hơn mặc định để một trang 10 dòng không phải cuộn nhiều.
const cellSx = { ...bodyCellSx, py: 1 };

// Độ rộng theo phần trăm: cột cố định (không xê dịch giữa các trang) mà vẫn dàn đều hết chiều ngang.
const COLUMNS = [
  ['Tài khoản', '22%'],
  ['Email', '25%'],
  ['Vai trò', '15%'],
  ['Trạng thái', '14%'],
  ['Thao tác', undefined]
];

function DetailDialog({ id, onClose }) {
  const { data, error } = useSWR(id ? ['account', String(id)] : null, () => accountsApi.detail(id), { revalidateOnFocus: false });
  const rows = data
    ? [
        ['Email', data.email],
        ['Điện thoại', data.phone],
        ['Vai trò', ROLE_LABEL[data.role]],
        ['Trạng thái', ACCOUNT_STATUS[data.status]?.label ?? data.status],
        ['Ngày tham gia', formatDate(data.createdAt)],
        ['Người tạo', data.createdByName]
      ]
    : [];
  return (
    <Dialog open={Boolean(id)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle sx={{ fontSize: fs.cardTitle }}>{data?.fullName ?? 'Chi tiết tài khoản'}</DialogTitle>
      <DialogContent>
        {error && <Typography color="error">{error.message}</Typography>}
        {!data && !error && <Skeleton variant="rounded" height={140} />}
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '130px 1fr', py: 0.75 }}>
            <Typography sx={{ color: brand.muted, fontSize: fs.body }}>{label}</Typography>
            <Typography sx={{ fontWeight: 600, fontSize: fs.body, wordBreak: 'break-word' }}>{value || '—'}</Typography>
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <OutlineButton onClick={onClose} sx={{ fontSize: fs.body }}>
          Đóng
        </OutlineButton>
      </DialogActions>
    </Dialog>
  );
}

export default function AccountListPage() {
  useCrumbs(['Tài khoản']);
  const { account: me } = useAuth();
  const [toast, showToast] = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [resetting, setResetting] = useState(null);
  const [exporting, setExporting] = useState(false);
  const search = useDebounced(q.trim());

  const params = { q: search, role, status, page, size: PAGE_SIZE };
  const list = useSWR(['account-list', params], () => accountsApi.list(params), { keepPreviousData: true, revalidateOnFocus: false });
  const summary = useSWR('accounts-summary', accountsApi.summary, { revalidateOnFocus: false });
  const requests = useSWR('reset-requests', accountsApi.resetRequests, { revalidateOnFocus: false });
  const requested = new Set((requests.data ?? []).map((item) => item.userId));

  const byStatus = summary.data?.byStatus ?? {};
  const tabs = [
    { value: '', label: 'Tất cả tài khoản', count: summary.data?.total ?? 0 },
    { value: 'ACTIVE', label: ACCOUNT_STATUS.ACTIVE.label, count: byStatus.ACTIVE ?? 0 },
    { value: 'LOCKED', label: ACCOUNT_STATUS.LOCKED.label, count: byStatus.LOCKED ?? 0 }
  ];

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  async function toggleLock(account) {
    const locked = account.status === 'LOCKED';
    setBusy(account.id);
    try {
      await (locked ? accountsApi.unlock(account.id) : accountsApi.lock(account.id));
      await Promise.all([list.mutate(), summary.mutate()]);
      showToast(locked ? `Đã mở khóa tài khoản ${account.fullName}.` : `Đã khóa tài khoản ${account.fullName}.`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const rows = await fetchAll((paging) => accountsApi.list({ q: search, role, status, ...paging }));
      downloadCsv(
        'accounts.csv',
        ['Họ tên', 'Email', 'Điện thoại', 'Vai trò', 'Trạng thái'],
        rows.map((a) => [a.fullName, a.email, a.phone, ROLE_LABEL[a.role] ?? a.role, ACCOUNT_STATUS[a.status]?.label ?? a.status])
      );
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  const items = list.data?.items ?? [];

  function lockState(account) {
    if (account.id === me.id) return { disabled: true, hint: 'Bạn không thể khóa chính tài khoản của mình.' };
    if (account.status !== 'ACTIVE' && account.status !== 'LOCKED') {
      return {
        disabled: true,
        hint: `Chỉ khóa được tài khoản đang hoạt động. Tài khoản này đang ${ACCOUNT_STATUS[account.status]?.label.toLowerCase()}.`
      };
    }
    return { disabled: false, hint: '' };
  }

  return (
    <Box>
      <PageHeader
        title="Danh sách tài khoản"
        subtitle="Quản lý quyền truy cập của người dùng trong cửa hàng THORS."
        action={
          <OutlineButton startIcon={<DownloadOutlined />} onClick={exportCsv} disabled={exporting} sx={{ fontSize: fs.body }}>
            {exporting ? 'Đang xuất…' : 'Xuất danh sách'}
          </OutlineButton>
        }
      />

      {/* Tab trạng thái, tìm kiếm và bộ lọc nằm chung một hàng để đỡ tốn chiều cao. */}
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={1.5} alignItems={{ lg: 'center' }} sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
          {tabs.map((tab) => {
            const selected = status === tab.value;
            return (
              <Button
                key={tab.label}
                onClick={() => filter(setStatus)(tab.value)}
                aria-pressed={selected}
                sx={{
                  height: 40,
                  borderRadius: '10px',
                  border: `1px solid ${selected ? brand.cyan : brand.line}`,
                  bgcolor: selected ? brand.cyan : brand.surface,
                  color: selected ? brand.inkOnCyan : brand.ink,
                  fontWeight: 600,
                  fontSize: fs.body,
                  textTransform: 'none',
                  whiteSpace: 'nowrap',
                  px: 2
                }}
              >
                {tab.label}
                <Box component="span" sx={{ ml: 1, opacity: 0.8 }}>
                  {tab.count}
                </Box>
              </Button>
            );
          })}
        </Stack>
        <Box sx={{ flex: 1, minWidth: 240 }}>
          <SearchField placeholder="Tìm theo tên, email hoặc số điện thoại" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Lọc theo trạng thái" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} minWidth={180} />
        <FilterSelect label="Lọc theo vai trò" value={role} onChange={filter(setRole)} options={ROLE_OPTIONS} minWidth={190} />
      </Stack>

      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {list.error && (
          <Typography color="error" sx={{ p: 2, fontSize: fs.body }}>
            {list.error.message}
          </Typography>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 1180, tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                {COLUMNS.map(([label, width]) => (
                  <TableCell key={label} sx={{ ...headCellSx, width }}>
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((account) => {
                const locked = account.status === 'LOCKED';
                const state = lockState(account);
                const hasRequest = requested.has(account.id);
                const meta = ACCOUNT_STATUS[account.status];
                return (
                  <TableRow key={account.id} hover>
                    <TableCell sx={cellSx}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <UserAvatar name={account.fullName} src={account.avatarUrl} size={32} />
                        <Typography noWrap title={account.fullName} sx={{ fontWeight: 600, color: brand.ink, fontSize: fs.body, minWidth: 0 }}>
                          {account.fullName}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <Typography noWrap title={account.email} sx={{ color: brand.muted, fontSize: fs.body }}>
                        {account.email}
                      </Typography>
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <RoleChip role={account.role} />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      <StatusPill tone={meta?.tone} label={meta?.label ?? account.status} />
                    </TableCell>
                    <TableCell sx={cellSx}>
                      {/* "Xem" và "Khóa/Mở khóa" có ở mọi dòng nên luôn thẳng hàng; nút đặt lại mật khẩu chỉ có ở Chủ cửa hàng nên đứng sau. */}
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Button
                          size="small"
                          onClick={() => setViewing(account.id)}
                          sx={{ color: brand.ink, fontWeight: 600, fontSize: fs.caption, minWidth: 48, textTransform: 'none' }}
                        >
                          Xem
                        </Button>
                        <Tooltip title={state.hint}>
                          <span>
                            <Button
                              size="small"
                              disabled={state.disabled || busy === account.id}
                              onClick={() => toggleLock(account)}
                              aria-label={`${locked ? 'Mở khóa' : 'Khóa'} ${account.fullName}`}
                              sx={{
                                color: locked ? brand.ink : brand.dangerInk,
                                fontWeight: 600,
                                fontSize: fs.caption,
                                minWidth: 84,
                                justifyContent: 'flex-start',
                                textTransform: 'none'
                              }}
                            >
                              {locked ? 'Mở khóa' : 'Khóa'}
                            </Button>
                          </span>
                        </Tooltip>
                        {account.role === 'OWNER' && (
                          <Tooltip title={hasRequest ? '' : 'Chủ cửa hàng này chưa gửi yêu cầu đặt lại mật khẩu.'}>
                            <span>
                              <Button
                                size="small"
                                disabled={!hasRequest}
                                onClick={() => setResetting(account)}
                                sx={{ color: brand.ink, fontWeight: 600, fontSize: fs.caption, minWidth: 0, textTransform: 'none', whiteSpace: 'nowrap' }}
                              >
                                Đặt lại mật khẩu
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                        {hasRequest && <StatusPill tone="warning" label="Đã yêu cầu đặt lại" />}
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && <EmptyRow colSpan={5}>Không có tài khoản nào khớp với tìm kiếm.</EmptyRow>}
            </TableBody>
          </Table>
        </Box>
        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={PAGE_SIZE}
          noun="tài khoản"
          onPage={setPage}
        />
      </Box>

      <Typography sx={{ color: brand.muted, fontSize: fs.caption, mt: 1.5 }}>
        Khóa tài khoản sẽ chặn đăng nhập nhưng không xóa dữ liệu. Chỉ tài khoản Chủ cửa hàng mới được đặt lại mật khẩu, và mọi thay đổi đều được ghi
        vào Nhật ký hệ thống.
      </Typography>

      <DetailDialog id={viewing} onClose={() => setViewing(null)} />
      {resetting && (
        <ResetPasswordDialog
          account={resetting}
          onClose={() => setResetting(null)}
          onDone={(message) => {
            setResetting(null);
            requests.mutate();
            showToast(message);
          }}
        />
      )}
      {toast}
    </Box>
  );
}
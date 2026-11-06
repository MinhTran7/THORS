import { useEffect, useState } from 'react';
import { Link as RouterLink, useLocation } from 'react-router-dom';
import useSWR from 'swr';
import {
  Box,
  Button,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { Stack } from '../components/Flex';
import { EditOutlined, MoreOutlined, PlusOutlined, TeamOutlined, UserDeleteOutlined, UserSwitchOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { accountsApi } from '../api';
import { ACCOUNT_STATUS, PAGE_SIZE } from '../constants';
import { useDebounced } from '../hooks';
import { brand, cardSx } from '../tokens';
import { BrandButton, BrandSwitch } from '../components/Brand';
import { RoleChip, StatusPill } from '../components/Chips';
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
import ResetPasswordDialog from '../components/ResetPasswordDialog';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';

// Trang này chỉ quản lý Family member nên role luôn cố định.
const FAMILY_ROLE = 'FAMILY_MEMBER';

// Dùng 'ALL' thay cho '' để Select luôn hiển thị được nhãn "Tất cả trạng thái".
const ALL = 'ALL';
const STATUS_OPTIONS = [
  { value: ALL, label: 'Tất cả trạng thái' },
  { value: 'ACTIVE', label: 'Đã kích hoạt' },
  { value: 'DISABLED', label: 'Đã vô hiệu hóa' },
  { value: 'LOCKED', label: 'Đã khóa' },
  { value: 'PENDING_VERIFICATION', label: 'Chờ xác minh' }
];

// Độ rộng cột cố định để bảng không bị nhảy khi nhãn trạng thái đổi (vd. "Đã kích hoạt" ↔ "Đã vô hiệu hóa").
const COLUMNS = [
  { label: 'Tên', width: '20%' },
  { label: 'Vai trò', width: '16%' },
  { label: 'Liên hệ', width: '26%' },
  { label: 'Trạng thái', width: '24%' },
  { label: 'Thao tác', width: '14%' }
];

export default function FamilyListPage() {
  useCrumbs(['Gia đình']);
  const location = useLocation();
  const [toast, showToast] = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState(ALL);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(null);
  const [menu, setMenu] = useState(null); // { anchor, account }
  const [resetting, setResetting] = useState(null);
  const search = useDebounced(q.trim());

  const params = { q: search, role: FAMILY_ROLE, status: status === ALL ? '' : status, page, size: PAGE_SIZE };
  const list = useSWR(['family-list', params], () => accountsApi.list(params), { keepPreviousData: true, revalidateOnFocus: false });
  const summary = useSWR('accounts-summary', accountsApi.summary, { revalidateOnFocus: false });
  // Đếm số family member đang active (summary.byStatus tính chung mọi role nên không dùng được).
  const activeCount = useSWR(
    ['family-active-count'],
    () => accountsApi.list({ q: '', role: FAMILY_ROLE, status: 'ACTIVE', page: 0, size: 1 }),
    { revalidateOnFocus: false }
  );
  // Đếm số family member bị vô hiệu hóa (DISABLED). Không tính tài khoản chờ xác minh hay bị khóa.
  const disabledCount = useSWR(
    ['family-disabled-count'],
    () => accountsApi.list({ q: '', role: FAMILY_ROLE, status: 'DISABLED', page: 0, size: 1 }),
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      window.history.replaceState({}, '');
    }
  }, [location.state, showToast]);

  const total = summary.data?.byRole?.[FAMILY_ROLE] ?? 0;
  const active = activeCount.data?.total ?? 0;
  const inactive = disabledCount.data?.total ?? 0;
  const statsLoading = summary.isLoading || activeCount.isLoading || disabledCount.isLoading;

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  async function toggle(account) {
    // Chỉ cho bật/tắt khi tài khoản đang ACTIVE hoặc DISABLED.
    // Tài khoản LOCKED (admin khóa) hoặc PENDING_VERIFICATION (chưa xác minh email) không được đổi ở đây.
    if (account.status !== 'ACTIVE' && account.status !== 'DISABLED') return;
    const next = account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setBusy(account.id);
    try {
      await accountsApi.setStatus(account.id, next);
      await Promise.all([list.mutate(), summary.mutate(), activeCount.mutate(), disabledCount.mutate()]);
      showToast(next === 'ACTIVE' ? `${account.fullName} có thể đăng nhập trở lại.` : `Đã vô hiệu hóa tài khoản ${account.fullName}.`);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  const items = list.data?.items ?? [];

  return (
    <Box>
      <PageHeader
        title="Danh sách thành viên gia đình"
        subtitle="Quản lý các thành viên gia đình được phép xem cửa hàng của bạn."
        action={
          <BrandButton component={RouterLink} to="/family/new" startIcon={<PlusOutlined />}>
            Thêm thành viên
          </BrandButton>
        }
      />
      <StatRow>
        <StatCard
          label="Thành viên gia đình"
          value={total}
          caption={`${total} thành viên`}
          icon={<TeamOutlined />}
          loading={statsLoading}
        />
        <StatCard
          label="Tài khoản đã kích hoạt"
          value={active}
          caption="Sẵn sàng truy cập cửa hàng"
          icon={<UserSwitchOutlined />}
          loading={statsLoading}
        />
        <StatCard
          label="Tài khoản đã vô hiệu hóa"
          value={inactive}
          caption="Tạm thời không thể truy cập cửa hàng"
          icon={<UserDeleteOutlined />}
          warning
          loading={statsLoading}
        />
      </StatRow>

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Tìm theo tên, email hoặc số điện thoại" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Lọc theo trạng thái" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} />
      </Toolbar>

      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {list.error && (
          <Typography color="error" sx={{ p: 2 }}>
            {list.error.message}
          </Typography>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 860, tableLayout: 'fixed' }}>
            <TableHead>
              <TableRow>
                {COLUMNS.map((col) => (
                  <TableCell key={col.label} sx={{ ...headCellSx, width: col.width }}>
                    {col.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((account) => {
                const locked = account.status === 'LOCKED';
                const pending = account.status === 'PENDING_VERIFICATION';
                const meta = ACCOUNT_STATUS[account.status] ?? { label: account.status, tone: 'neutral' };
                const switchHint = locked ? 'Đã bị quản trị viên khóa. Chỉ quản trị viên mới có thể mở khóa.' : '';
                return (
                  <TableRow key={account.id} hover>
                    <TableCell sx={bodyCellSx}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <UserAvatar name={account.fullName} src={account.avatarUrl} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
                          {account.fullName}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <RoleChip role={account.role} />
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Typography variant="body2" sx={{ wordBreak: 'break-word' }}>
                        {account.email}
                      </Typography>
                      <Typography variant="caption" sx={{ color: brand.muted }}>
                        {account.phone || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        {/* Tài khoản chờ xác minh chưa thể khóa/mở khóa: ẩn công tắc nhưng vẫn giữ chỗ để nhãn không bị lệch. */}
                        <Tooltip title={switchHint}>
                          <span style={pending ? { visibility: 'hidden' } : undefined} aria-hidden={pending || undefined}>
                            <BrandSwitch
                              size="small"
                              checked={account.status === 'ACTIVE'}
                              disabled={locked || pending || busy === account.id}
                              onChange={() => toggle(account)}
                              slotProps={{ input: { 'aria-label': `Quyền truy cập của ${account.fullName}` } }}
                            />
                          </span>
                        </Tooltip>
                        <StatusPill tone={meta.tone} label={meta.label} />
                      </Stack>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        <Button
                          size="small"
                          component={RouterLink}
                          to={`/family/${account.id}`}
                          sx={{ color: brand.ink, fontWeight: 600, minWidth: 0 }}
                        >
                          Xem
                        </Button>
                        <IconButton
                          size="small"
                          component={RouterLink}
                          to={`/family/${account.id}/edit`}
                          aria-label={`Chỉnh sửa ${account.fullName}`}
                        >
                          <EditOutlined />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={`Thao tác khác cho ${account.fullName}`}
                          onClick={(event) => setMenu({ anchor: event.currentTarget, account })}
                        >
                          <MoreOutlined />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && (
                <EmptyRow colSpan={5}>Không có thành viên gia đình nào phù hợp với tìm kiếm.</EmptyRow>
              )}
            </TableBody>
          </Table>
        </Box>
        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={PAGE_SIZE}
          noun="thành viên"
          onPage={setPage}
        />
      </Box>

      <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 2.5 }}>
        Chỉ Chủ cửa hàng mới có thể tạo tài khoản hoặc thay đổi quyền truy cập. Mỗi tài khoản có đăng nhập an toàn riêng.
      </Typography>

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setResetting(menu.account);
            setMenu(null);
          }}
        >
          <ListItemText>Đặt lại mật khẩu</ListItemText>
        </MenuItem>
      </Menu>
      {resetting && (
        <ResetPasswordDialog
          account={resetting}
          onClose={() => setResetting(null)}
          onDone={(message) => {
            setResetting(null);
            showToast(message);
          }}
        />
      )}
      {toast}
    </Box>
  );
}
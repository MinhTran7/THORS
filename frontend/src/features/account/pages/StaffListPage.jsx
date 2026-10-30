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

// Dùng 'ALL' thay cho '' để Select luôn hiển thị được nhãn "All statuses".
const ALL = 'ALL';
const STATUS_OPTIONS = [
  { value: ALL, label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Inactive' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'PENDING_VERIFICATION', label: 'Pending' }
];

export default function StaffListPage() {
  useCrumbs(['Family']);
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

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      window.history.replaceState({}, '');
    }
  }, [location.state, showToast]);

  const total = summary.data?.byRole?.[FAMILY_ROLE] ?? 0;
  const active = activeCount.data?.total ?? 0;
  const statsLoading = summary.isLoading || activeCount.isLoading;

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  async function toggle(account) {
    const next = account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setBusy(account.id);
    try {
      await accountsApi.setStatus(account.id, next);
      await Promise.all([list.mutate(), summary.mutate(), activeCount.mutate()]);
      showToast(next === 'ACTIVE' ? `${account.fullName} can sign in again.` : `${account.fullName} was deactivated.`);
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
        title="Family List"
        subtitle="Manage the family members who can view your store."
        action={
          <BrandButton component={RouterLink} to="/family/new" startIcon={<PlusOutlined />}>
            Add Member
          </BrandButton>
        }
      />
      <StatRow>
        <StatCard
          label="Family members"
          value={total}
          caption={`${total} family ${total === 1 ? 'member' : 'members'}`}
          icon={<TeamOutlined />}
          loading={statsLoading}
        />
        <StatCard
          label="Active accounts"
          value={active}
          caption="Ready to access the store"
          icon={<UserSwitchOutlined />}
          loading={statsLoading}
        />
        <StatCard
          label="Inactive accounts"
          value={Math.max(total - active, 0)}
          caption="Access temporarily disabled"
          icon={<UserDeleteOutlined />}
          warning
          loading={statsLoading}
        />
      </StatRow>

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Search by name, email or phone" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Filter by status" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} />
      </Toolbar>

      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {list.error && (
          <Typography color="error" sx={{ p: 2 }}>
            {list.error.message}
          </Typography>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                {['Name', 'Role', 'Contact', 'Status', 'Actions'].map((label) => (
                  <TableCell key={label} sx={headCellSx}>
                    {label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((account) => {
                const locked = account.status === 'LOCKED';
                const meta = ACCOUNT_STATUS[account.status] ?? { label: account.status, tone: 'neutral' };
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
                      <Typography variant="body2">{account.email}</Typography>
                      <Typography variant="caption" sx={{ color: brand.muted }}>
                        {account.phone || '—'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Tooltip title={locked ? 'Locked by an administrator. Only an admin can unlock it.' : ''}>
                          <span>
                            <BrandSwitch
                              size="small"
                              checked={account.status === 'ACTIVE'}
                              disabled={locked || busy === account.id}
                              onChange={() => toggle(account)}
                              slotProps={{ input: { 'aria-label': `Access for ${account.fullName}` } }}
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
                          View
                        </Button>
                        <IconButton
                          size="small"
                          component={RouterLink}
                          to={`/family/${account.id}/edit`}
                          aria-label={`Edit ${account.fullName}`}
                        >
                          <EditOutlined />
                        </IconButton>
                        <IconButton
                          size="small"
                          aria-label={`More actions for ${account.fullName}`}
                          onClick={(event) => setMenu({ anchor: event.currentTarget, account })}
                        >
                          <MoreOutlined />
                        </IconButton>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && <EmptyRow colSpan={5}>No family members match your search.</EmptyRow>}
            </TableBody>
          </Table>
        </Box>
        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={PAGE_SIZE}
          noun="family members"
          onPage={setPage}
        />
      </Box>

      <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 2.5 }}>
        Only the Shop Owner can create accounts or change access. Every account has its own secure sign-in.
      </Typography>

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setResetting(menu.account);
            setMenu(null);
          }}
        >
          <ListItemText>Reset password</ListItemText>
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
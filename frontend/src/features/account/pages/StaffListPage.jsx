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

const ROLE_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'FAMILY_MEMBER', label: 'Family' }
];
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DISABLED', label: 'Inactive' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'PENDING_VERIFICATION', label: 'Pending' }
];

export default function StaffListPage() {
  useCrumbs(['Staff']);
  const location = useLocation();
  const [toast, showToast] = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(null);
  const [menu, setMenu] = useState(null); // { anchor, account }
  const [resetting, setResetting] = useState(null);
  const search = useDebounced(q.trim());

  const params = { q: search, role, status, page, size: PAGE_SIZE };
  const list = useSWR(['staff-list', params], () => accountsApi.list(params), { keepPreviousData: true, revalidateOnFocus: false });
  const summary = useSWR('accounts-summary', accountsApi.summary, { revalidateOnFocus: false });

  useEffect(() => {
    if (location.state?.toast) {
      showToast(location.state.toast);
      window.history.replaceState({}, '');
    }
  }, [location.state, showToast]);

  const byRole = summary.data?.byRole ?? {};
  const byStatus = summary.data?.byStatus ?? {};
  const total = summary.data?.total ?? 0;
  const active = byStatus.ACTIVE ?? 0;

  const filter = (setter) => (value) => {
    setter(value);
    setPage(0);
  };

  async function toggle(account) {
    const next = account.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    setBusy(account.id);
    try {
      await accountsApi.setStatus(account.id, next);
      await Promise.all([list.mutate(), summary.mutate()]);
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
        title="Staff List"
        subtitle="Manage the people who help your store run smoothly."
        action={
          <BrandButton component={RouterLink} to="/staff/new" startIcon={<PlusOutlined />}>
            Add Staff
          </BrandButton>
        }
      />
      <StatRow>
        <StatCard
          label="Team accounts"
          value={total}
          caption={`${byRole.STAFF ?? 0} staff · ${byRole.FAMILY_MEMBER ?? 0} family members`}
          icon={<TeamOutlined />}
          loading={summary.isLoading}
        />
        <StatCard
          label="Active accounts"
          value={active}
          caption="Ready to access the store"
          icon={<UserSwitchOutlined />}
          loading={summary.isLoading}
        />
        <StatCard
          label="Inactive accounts"
          value={total - active}
          caption="Access temporarily disabled"
          icon={<UserDeleteOutlined />}
          warning
          loading={summary.isLoading}
        />
      </StatRow>

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Search by name, email or phone" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Filter by role" value={role} onChange={filter(setRole)} options={ROLE_OPTIONS} />
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
                          to={`/staff/${account.id}`}
                          sx={{ color: brand.ink, fontWeight: 600, minWidth: 0 }}
                        >
                          View
                        </Button>
                        <IconButton
                          size="small"
                          component={RouterLink}
                          to={`/staff/${account.id}/edit`}
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
              {!list.isLoading && items.length === 0 && <EmptyRow colSpan={5}>No team accounts match your search.</EmptyRow>}
            </TableBody>
          </Table>
        </Box>
        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={PAGE_SIZE}
          noun="team accounts"
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
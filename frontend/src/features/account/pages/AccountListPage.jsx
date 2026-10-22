import { useState } from 'react';
import useSWR from 'swr';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemText,
  Menu,
  MenuItem,
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
import { DownloadOutlined, MoreOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { downloadCsv } from 'utils/csv';
import { accountsApi, fetchAll } from '../api';
import { ACCOUNT_STATUS, PAGE_SIZE, ROLE_LABEL } from '../constants';
import { formatDate } from '../format';
import { useDebounced } from '../hooks';
import { brand, cardSx } from '../tokens';
import { BrandSwitch, OutlineButton } from '../components/Brand';
import { RoleChip, StatusPill } from '../components/Chips';
import { EmptyRow, FilterSelect, NoticeBox, PageHeader, Pager, SearchField, Toolbar, bodyCellSx, headCellSx } from '../components/Blocks';
import ResetPasswordDialog from '../components/ResetPasswordDialog';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';

const ROLE_OPTIONS = [{ value: '', label: 'All roles' }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))];
const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'ACTIVE', label: 'Active' },
  { value: 'LOCKED', label: 'Locked' },
  { value: 'DISABLED', label: 'Inactive' },
  { value: 'PENDING_VERIFICATION', label: 'Pending' }
];

function DetailDialog({ id, onClose }) {
  const { data, error } = useSWR(id ? ['account', String(id)] : null, () => accountsApi.detail(id), { revalidateOnFocus: false });
  const rows = data
    ? [
        ['Email', data.email],
        ['Phone', data.phone],
        ['Role', ROLE_LABEL[data.role]],
        ['Status', ACCOUNT_STATUS[data.status]?.label ?? data.status],
        ['Joined', formatDate(data.createdAt)],
        ['Created by', data.createdByName]
      ]
    : [];
  return (
    <Dialog open={Boolean(id)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{data?.fullName ?? 'Account details'}</DialogTitle>
      <DialogContent>
        {error && <Typography color="error">{error.message}</Typography>}
        {!data && !error && <Skeleton variant="rounded" height={140} />}
        {rows.map(([label, value]) => (
          <Box key={label} sx={{ display: 'grid', gridTemplateColumns: '110px 1fr', py: 0.75 }}>
            <Typography variant="body2" sx={{ color: brand.muted }}>
              {label}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600, wordBreak: 'break-word' }}>
              {value || '—'}
            </Typography>
          </Box>
        ))}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <OutlineButton onClick={onClose}>Close</OutlineButton>
      </DialogActions>
    </Dialog>
  );
}

export default function AccountListPage() {
  useCrumbs(['Accounts']);
  const { account: me } = useAuth();
  const [toast, showToast] = useToast();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(null);
  const [menu, setMenu] = useState(null);
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
    { value: '', label: 'All accounts', count: summary.data?.total ?? 0 },
    { value: 'ACTIVE', label: 'Active', count: byStatus.ACTIVE ?? 0 },
    { value: 'LOCKED', label: 'Locked', count: byStatus.LOCKED ?? 0 }
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
      showToast(locked ? `${account.fullName} was unlocked.` : `${account.fullName} was locked.`);
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
        ['Name', 'Email', 'Phone', 'Role', 'Status'],
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
    if (account.id === me.id) return { disabled: true, hint: "You can't lock your own account." };
    if (account.status !== 'ACTIVE' && account.status !== 'LOCKED') {
      return {
        disabled: true,
        hint: `Only active accounts can be locked. This account is ${ACCOUNT_STATUS[account.status]?.label.toLowerCase()}.`
      };
    }
    return { disabled: false, hint: '' };
  }

  return (
    <Box>
      <PageHeader
        title="Account List"
        subtitle="Manage user access for this THORS store."
        action={
          <OutlineButton startIcon={<DownloadOutlined />} onClick={exportCsv} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export accounts'}
          </OutlineButton>
        }
      />
      <Stack direction="row" spacing={1.5} sx={{ mb: 2.5, flexWrap: 'wrap', rowGap: 1 }}>
        {tabs.map((tab) => {
          const selected = status === tab.value;
          return (
            <Button
              key={tab.label}
              onClick={() => filter(setStatus)(tab.value)}
              aria-pressed={selected}
              sx={{
                borderRadius: '10px',
                border: `1px solid ${selected ? brand.cyan : brand.line}`,
                bgcolor: selected ? brand.cyan : brand.surface,
                color: selected ? brand.inkOnCyan : brand.ink,
                fontWeight: 600,
                textTransform: 'none',
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

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Search by name, email or phone" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Filter by status" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} />
        <FilterSelect label="Filter by role" value={role} onChange={filter(setRole)} options={ROLE_OPTIONS} />
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
                {['Account', 'Role', 'Lock / Unlock', 'Actions'].map((label) => (
                  <TableCell key={label} sx={headCellSx}>
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
                const statusLabel = locked
                  ? 'Locked'
                  : account.status === 'ACTIVE'
                    ? 'Unlocked'
                    : (ACCOUNT_STATUS[account.status]?.label ?? account.status);
                return (
                  <TableRow key={account.id} hover>
                    <TableCell sx={bodyCellSx}>
                      <Stack direction="row" spacing={1.5} alignItems="center">
                        <UserAvatar name={account.fullName} src={account.avatarUrl} />
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
                            {account.fullName}
                          </Typography>
                          <Typography variant="caption" sx={{ color: brand.muted }}>
                            {account.email}
                          </Typography>
                        </Box>
                      </Stack>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <RoleChip role={account.role} />
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Tooltip title={state.hint}>
                          <span>
                            <BrandSwitch
                              size="small"
                              checked={locked}
                              disabled={state.disabled || busy === account.id}
                              onChange={() => toggleLock(account)}
                              slotProps={{ input: { 'aria-label': `${locked ? 'Unlock' : 'Lock'} ${account.fullName}` } }}
                            />
                          </span>
                        </Tooltip>
                        <Typography variant="caption" sx={{ color: brand.muted }}>
                          {statusLabel}
                        </Typography>
                      </Stack>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Stack direction="row" spacing={0.5} alignItems="center">
                        {account.role === 'OWNER' && (
                          <Tooltip title={hasRequest ? '' : 'This Shop Owner has not requested a password reset.'}>
                            <span>
                              <Button
                                size="small"
                                disabled={!hasRequest}
                                onClick={() => setResetting(account)}
                                sx={{ color: brand.ink, fontWeight: 600, minWidth: 0, textTransform: 'none' }}
                              >
                                Reset Password
                              </Button>
                            </span>
                          </Tooltip>
                        )}
                        <Button size="small" onClick={() => setViewing(account.id)} sx={{ color: brand.ink, fontWeight: 600, minWidth: 0 }}>
                          View
                        </Button>
                        <IconButton
                          size="small"
                          aria-label={`More actions for ${account.fullName}`}
                          onClick={(event) => setMenu({ anchor: event.currentTarget, account })}
                        >
                          <MoreOutlined />
                        </IconButton>
                      </Stack>
                      {hasRequest && <StatusPill tone="warning" label="Reset requested" />}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && <EmptyRow colSpan={4}>No accounts match your search.</EmptyRow>}
            </TableBody>
          </Table>
        </Box>
        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={PAGE_SIZE}
          noun="accounts"
          onPage={setPage}
        />
      </Box>

      <NoticeBox title="Account access is audited" sx={{ mt: 3 }}>
        Locking blocks sign-in without deleting data. Password resets are available for the Shop Owner account only. All changes appear in
        System Log.
      </NoticeBox>

      <Menu anchorEl={menu?.anchor} open={Boolean(menu)} onClose={() => setMenu(null)}>
        <MenuItem
          onClick={() => {
            setViewing(menu.account.id);
            setMenu(null);
          }}
        >
          <ListItemText>View details</ListItemText>
        </MenuItem>
        {(() => {
          const target = menu?.account;
          if (!target) return null;
          const state = lockState(target);
          return (
            <MenuItem
              disabled={state.disabled}
              onClick={() => {
                toggleLock(target);
                setMenu(null);
              }}
            >
              <ListItemText>{target.status === 'LOCKED' ? 'Unlock account' : 'Lock account'}</ListItemText>
            </MenuItem>
          );
        })()}
      </Menu>
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
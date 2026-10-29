import { useState } from 'react';
import useSWR from 'swr';
import { Box, IconButton, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { Stack } from '../components/Flex';
import { CheckCircleOutlined, DownloadOutlined, FileTextOutlined, ReloadOutlined, SafetyOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { downloadCsv } from 'utils/csv';
import { fetchAll, logsApi } from '../api';
import { LOG_STATUS, PAGE_SIZE, ROLE_LABEL } from '../constants';
import { formatLogDate, formatTime, humanize, parseUtc, toYmd, tzLabel, tzOffsetMinutes } from '../format';
import { useDebounced } from '../hooks';
import { brand, cardSx } from '../tokens';
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
  LOGIN: 'Signed in',
  LOGIN_FAILED: 'Sign-in attempt failed',
  LOGIN_FAILURE: 'Sign-in attempt failed',
  LOGIN_LOCK: 'Sign-in paused after repeated failures',
  ACCOUNT_CREATE: 'Account created',
  ACCOUNT_EDIT: 'Account updated',
  ACCOUNT_LOCK: 'Account locked',
  ACCOUNT_UNLOCK: 'Account unlocked',
  ACCOUNT_ACTIVATE: 'Account activated',
  ACCOUNT_DEACTIVATE: 'Account deactivated',
  PASSWORD_CHANGE: 'Password changed',
  PASSWORD_RESET: 'Password reset',
  PASSWORD_RESET_ADMIN: 'Password reset by a manager',
  PASSWORD_RESET_REQUEST: 'Password reset requested',
  PROFILE_UPDATE: 'Profile updated',
  PHONE_ADDED: 'Phone number added'
};

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...Object.entries(LOG_STATUS).map(([value, meta]) => ({ value, label: meta.label }))
];

const actionLabel = (item) => ACTION_LABELS[item.action] ?? humanize(item.action);

function subtitle(item) {
  const role = item.targetRole ? ROLE_LABEL[item.targetRole] : '';
  if (item.action === 'LOGIN_FAILED') return [item.newValue, role].filter(Boolean).join(' · ');
  return [item.targetName, role].filter(Boolean).join(' · ') || item.newValue || '';
}

export default function SystemLogPage() {
  useCrumbs(['System Log']);
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

  const params = { q: search, status, from, to, offset, page, size: PAGE_SIZE };
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
        ['Timestamp (UTC)', 'User', 'Action', 'Details', 'IP address', 'Status'],
        rows.map((item) => [
          parseUtc(item.performedAt)?.toISOString() ?? '',
          item.actorName ?? 'System',
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
        minWidth: 160,
        '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', '& fieldset': { borderColor: brand.line } }
      }}
    />
  );

  return (
    <Box>
      <PageHeader
        title="System Log"
        subtitle="A reliable record of account management and security activity."
        action={
          <OutlineButton startIcon={<DownloadOutlined />} onClick={exportCsv} disabled={exporting}>
            {exporting ? 'Exporting…' : 'Export log'}
          </OutlineButton>
        }
      />
      <StatRow>
        <StatCard
          label="Events today"
          value={stats?.eventsToday}
          caption="Across all system accounts"
          icon={<FileTextOutlined />}
          loading={!stats}
        />
        <StatCard
          label="Successful actions"
          value={stats?.successfulToday}
          caption={`${successRate}% completed successfully`}
          icon={<CheckCircleOutlined />}
          loading={!stats}
        />
        <StatCard
          label="Security alerts"
          value={stats?.securityAlertsToday}
          caption={stats ? `${stats.failedSignInsToday} failed sign-ins · ${stats.locksToday} account locks` : ' '}
          icon={<SafetyOutlined />}
          warning
          loading={!stats}
        />
      </StatRow>

      <Toolbar>
        <Box sx={{ flex: 1 }}>
          <SearchField placeholder="Search user, action or IP address" value={q} onChange={filter(setQ)} />
        </Box>
        <FilterSelect label="Filter by status" value={status} onChange={filter(setStatus)} options={STATUS_OPTIONS} />
        {dateField('From', from, setFrom)}
        {dateField('To', to, setTo)}
      </Toolbar>

      <Box sx={{ ...cardSx, overflow: 'hidden' }}>
        {list.error && (
          <Typography color="error" sx={{ p: 2 }}>
            {list.error.message}
          </Typography>
        )}
        <Box sx={{ overflowX: 'auto' }}>
          <Table size="small" sx={{ minWidth: 760 }}>
            <TableHead>
              <TableRow>
                {['Timestamp', 'User', 'Action', 'IP Address', 'Status'].map((label) => (
                  <TableCell key={label} sx={headCellSx}>
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
                    <TableCell sx={bodyCellSx}>
                      <Typography variant="body2">{formatLogDate(item.performedAt)}</Typography>
                      <Typography variant="caption" sx={{ color: brand.muted }}>
                        {formatTime(item.performedAt)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Typography variant="body2">{item.actorName ?? 'System'}</Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: brand.ink }}>
                        {actionLabel(item)}
                      </Typography>
                      <Typography variant="caption" sx={{ color: brand.muted }}>
                        {subtitle(item)}
                      </Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <Typography variant="body2">{item.ip ?? '—'}</Typography>
                    </TableCell>
                    <TableCell sx={bodyCellSx}>
                      <StatusPill tone={meta.tone} label={meta.label} />
                    </TableCell>
                  </TableRow>
                );
              })}
              {!list.isLoading && items.length === 0 && <EmptyRow colSpan={5}>No events match your filters.</EmptyRow>}
            </TableBody>
          </Table>
        </Box>
        <Pager
          page={page}
          totalPages={list.data?.totalPages ?? 0}
          total={list.data?.total ?? 0}
          size={PAGE_SIZE}
          noun="events"
          onPage={setPage}
        />
      </Box>

      <Stack direction="row" alignItems="center" spacing={1} sx={{ mt: 2.5 }}>
        <Typography variant="caption" sx={{ color: brand.muted }}>
          {`Audit records are read-only. All times in ${tzLabel()}.${
            refreshedAt ? ` Last refreshed: ${refreshedAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : ''
          }`}
        </Typography>
        <Tooltip title="Refresh">
          <IconButton
            size="small"
            aria-label="Refresh log"
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
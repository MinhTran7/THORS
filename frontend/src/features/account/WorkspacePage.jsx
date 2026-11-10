import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';

import { BarChart } from '@mui/x-charts/BarChart';

import {
  AppstoreOutlined,
  ArrowRightOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  DollarOutlined,
  FacebookOutlined,
  GlobalOutlined,
  PlusOutlined,
  ReloadOutlined,
  ShopOutlined,
  ShoppingOutlined,
  TeamOutlined,
  WarningOutlined
} from '@ant-design/icons';

import { useAuth } from 'features/auth/AuthProvider';
import { getDashboardSummary } from '../../services/dashboardService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from '../customer/theme';

// Màu bổ sung theo Design System (PromotionPage.jsx)
const T = {
  title: '#0F172A',
  subtle: '#94A3B8',
  cyanText: '#0E7490',
  cream: '#FFF7AE',
  creamText: '#713F12'
};

// Màu 3 kênh bán trên biểu đồ / thanh tỷ trọng
// color: cột biểu đồ / thanh tỷ trọng; tint + iconColor: ô icon và nhãn % trong khung "Tỷ trọng theo kênh"
const CHANNELS = [
  { key: 'IN_STORE', label: 'Tại quầy', color: '#8EECF5', tint: '#E6FAFC', iconColor: '#0E7490', icon: <ShopOutlined /> },
  { key: 'WEB', label: 'Website', color: '#0E7490', tint: '#E0F2F7', iconColor: '#0E7490', icon: <GlobalOutlined /> },
  { key: 'FACEBOOK', label: 'Facebook', color: '#FCD34D', tint: '#FFF7AE', iconColor: '#713F12', icon: <FacebookOutlined /> }
];

const RANGES = [
  { key: 'today', label: 'Hôm nay' },
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: 'month', label: 'Tháng này' }
];

// ==========================================
// HELPERS
// ==========================================

const pad = (n) => String(n).padStart(2, '0');
const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function rangeDates(key) {
  const today = new Date();
  const from = new Date(today);
  if (key === '7d') from.setDate(today.getDate() - 6);
  if (key === '30d') from.setDate(today.getDate() - 29);
  if (key === 'month') from.setDate(1);
  return { from: isoDate(from), to: isoDate(today) };
}

const toNumber = (v) => Number(v ?? 0) || 0;
const money = (v) => `${toNumber(v).toLocaleString('vi-VN')} ₫`;
const count = (v) => toNumber(v).toLocaleString('vi-VN');

// Rút gọn cho trục biểu đồ: 1,2 tr / 350 N
function compactMoney(v) {
  const n = toNumber(v);
  if (Math.abs(n) >= 1000000) return `${(n / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000).toLocaleString('vi-VN')} N`;
  return n.toLocaleString('vi-VN');
}

const shortDate = (iso) => {
  const [, m, d] = String(iso).split('-');
  return `${d}/${m}`;
};

// ==========================================
// BUILDING BLOCKS
// ==========================================

function DashboardCard({ title, subtitle, action, children }) {
  return (
    <Card sx={{ ...cardSx, height: '100%' }}>
      <CardContent sx={{ p: { xs: 2.5, sm: 3.5 }, '&:last-child': { pb: { xs: 2.5, sm: 3.5 } } }}>
        <Stack direction="row" spacing={2} sx={{ mb: 2.5, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography sx={{ fontWeight: 800, fontSize: 16, color: T.title }}>{title}</Typography>
            {subtitle && <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>{subtitle}</Typography>}
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function EmptyState({ message }) {
  return (
    <Box
      sx={{
        minHeight: 160,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        bgcolor: '#F8FAFC',
        border: `1.5px dashed ${C.border}`,
        borderRadius: 3,
        p: 3
      }}
    >
      <Typography sx={{ fontSize: 13.5, color: C.muted, maxWidth: 420, lineHeight: 1.6 }}>{message}</Typography>
    </Box>
  );
}

function SummaryCard({ label, value, note, icon, highlight, warn, loading, to }) {
  const linked = Boolean(to);
  return (
    <Card
      component={linked ? Link : 'div'}
      to={to}
      sx={{
        ...cardSx,
        display: 'block',
        height: '100%',
        textDecoration: 'none',
        bgcolor: highlight ? '#F0FCFE' : C.surface,
        border: `1.5px solid ${highlight ? C.cyan : C.border}`,
        transition: 'all 0.2s ease',
        '&:hover': linked ? { boxShadow: '0 4px 12px rgba(0,0,0,0.04)', borderColor: highlight ? C.cyanHover : '#CBD5E1' } : {}
      }}
    >
      <CardContent sx={{ p: { xs: 2.5, sm: 3 }, '&:last-child': { pb: { xs: 2.5, sm: 3 } } }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: C.muted }}>{label}</Typography>
          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              bgcolor: warn ? T.cream : highlight ? C.cyan : C.borderLight,
              color: warn ? T.creamText : T.title,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18
            }}
          >
            {icon}
          </Box>
        </Stack>

        <Box sx={{ mt: 1.5, minHeight: 44, display: 'flex', alignItems: 'center' }}>
          {loading ? (
            <CircularProgress size={24} sx={{ color: C.cyan }} />
          ) : (
            <Typography sx={{ fontSize: 26, fontWeight: 800, color: T.title, letterSpacing: -0.5 }}>{value ?? '—'}</Typography>
          )}
        </Box>

        <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 1, lineHeight: 1.5, minHeight: 19 }}>{loading ? '' : note}</Typography>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value, loading }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography sx={{ fontSize: 13.5, color: C.muted }}>{label}</Typography>
      {loading ? (
        <CircularProgress size={16} sx={{ color: C.cyan }} />
      ) : (
        <Typography sx={{ fontSize: 14.5, fontWeight: 800, color: T.title }}>{value}</Typography>
      )}
    </Stack>
  );
}

const linkButtonSx = {
  p: 0,
  minWidth: 0,
  textTransform: 'none',
  color: T.cyanText,
  fontWeight: 700,
  fontSize: 13,
  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' }
};

// ==========================================
// DASHBOARD (OWNER = toàn cửa hàng, FAMILY_MEMBER = doanh số của mình)
// ==========================================

function StoreDashboard({ account }) {
  const owner = account?.role === 'OWNER';
  const [rangeKey, setRangeKey] = useState('7d');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);

  const load = useCallback(async (key, isActive = () => true) => {
    try {
      setLoading(true);
      setError('');
      const result = await getDashboardSummary(rangeDates(key));
      if (!isActive()) return;
      setData(result);
      setUpdatedAt(new Date());
    } catch (err) {
      if (isActive()) setError(err?.message || 'Không thể tải số liệu bảng điều khiển.');
    } finally {
      if (isActive()) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    load(rangeKey, () => active);
    return () => {
      active = false;
    };
  }, [rangeKey, load]);

  const firstName = account?.fullName?.trim().split(/\s+/).slice(-1)[0] || 'bạn';
  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label.toLowerCase();

  const sales = data?.sales;
  const stock = data?.stock;
  const pending = data?.pending;
  const shop = data?.shop;
  const daily = useMemo(() => data?.daily ?? [], [data]);
  const hasRevenue = daily.some((d) => toNumber(d.total) > 0);
  const stockAlerts = stock ? toNumber(stock.outOfStock) + toNumber(stock.lowStock) : null;
  const pendingTotal = pending ? toNumber(pending.pendingConfirmation) + toNumber(pending.awaitingPickup) : null;

  // ==========================================
  // SUMMARY CARDS
  // ==========================================

  const stockCard = {
    label: 'Cảnh báo kho',
    value: stock ? count(stockAlerts) : null,
    note: stock
      ? stock.thresholdSupported
        ? `${count(stock.outOfStock)} hết hàng · ${count(stock.lowStock)} sắp hết`
        : `${count(stock.outOfStock)} biến thể hết hàng`
      : '',
    icon: <WarningOutlined />,
    warn: stockAlerts > 0,
    to: '/warehouse/inventory?state=' + (stock && toNumber(stock.outOfStock) === 0 ? 'low' : 'out')
  };

  const summaryStats = owner
    ? [
        {
          label: 'Doanh thu thuần',
          value: sales ? money(sales.netRevenue) : null,
          note: sales ? `Đã thu ${money(sales.grossRevenue)} · Hoàn ${money(sales.refunded)}` : '',
          icon: <DollarOutlined />,
          highlight: true
        },
        {
          label: 'Đơn hàng mới',
          value: sales ? count(sales.ordersCreated) : null,
          note: sales ? `${count(sales.paidOrders)} đã thu tiền · ${count(sales.ordersCancelled)} hủy/từ chối` : '',
          icon: <ShoppingOutlined />
        },
        {
          label: 'Đơn online cần xử lý',
          value: pending ? count(pendingTotal) : null,
          note: pending ? `${count(pending.pendingConfirmation)} chờ xác nhận · ${count(pending.awaitingPickup)} chờ lấy hàng` : '',
          icon: <ClockCircleOutlined />,
          warn: pendingTotal > 0,
          to: '/orders'
        },
        stockCard
      ]
    : [
        {
          label: 'Doanh số của bạn',
          value: sales ? money(sales.netRevenue) : null,
          note: sales ? `Từ ${count(sales.paidOrders)} đơn đã thu tiền` : '',
          icon: <DollarOutlined />,
          highlight: true
        },
        {
          label: 'Đơn bạn đã tạo',
          value: sales ? count(sales.ordersCreated) : null,
          note: sales ? `${count(sales.ordersCancelled)} đơn hủy/từ chối` : '',
          icon: <ShoppingOutlined />
        },
        {
          label: 'Giá trị đơn trung bình',
          value: sales ? money(sales.averageOrderValue) : null,
          note: 'Trên các đơn đã thu tiền',
          icon: <AppstoreOutlined />
        },
        stockCard
      ];

  // ==========================================
  // CHART + CHANNEL SHARE
  // ==========================================

  const chartSeries = CHANNELS.map((c) => ({
    id: c.key,
    label: c.label,
    color: c.color,
    stack: 'revenue',
    data: daily.map((d) => toNumber(d[c.key])),
    valueFormatter: (v) => money(v)
  }));

  const channelRows = CHANNELS.map((c) => {
    const row = sales?.byChannel?.[c.key] ?? {};
    const net = toNumber(row.netRevenue);
    const totalNet = toNumber(sales?.netRevenue);
    return { ...c, net, orders: toNumber(row.ordersCreated), share: totalNet > 0 ? Math.round((net / totalNet) * 100) : 0 };
  });

  // ==========================================
  // QUICK ACTIONS
  // ==========================================

  const quickActions = owner
    ? [
        { to: '/in-store-sales', label: 'Bán tại quầy', icon: <ShopOutlined /> },
        { to: '/facebook', label: 'Facebook', icon: <FacebookOutlined /> },
        { to: '/warehouse/inventory', label: 'Tồn kho', icon: <DatabaseOutlined /> },
        { to: '/categories', label: 'Danh mục', icon: <AppstoreOutlined /> },
        { to: '/family', label: 'Thành viên', icon: <TeamOutlined /> }
      ]
    : [
        { to: '/facebook', label: 'Facebook', icon: <FacebookOutlined /> },
        { to: '/warehouse/inventory', label: 'Tồn kho', icon: <DatabaseOutlined /> },
        { to: '/in-store-sales/history', label: 'Đơn tại quầy', icon: <ShoppingOutlined /> }
      ];

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 6, color: C.text }}>
      {/* PAGE HEADER */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: 11.5, fontWeight: 800, color: T.cyanText, letterSpacing: 1, mb: 0.5, textTransform: 'uppercase' }}>
            Hệ thống quản lý THORS
          </Typography>
          <Typography variant="h3" sx={{ fontSize: { xs: 22, sm: 26 }, fontWeight: 800, color: T.title }}>
            Bảng điều khiển tổng quan
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: C.muted, mt: 0.5, lineHeight: 1.6 }}>
            Xin chào, <strong>{firstName}</strong>! {owner ? 'Số liệu toàn cửa hàng' : 'Số liệu các đơn do bạn tạo (tại quầy, Facebook)'}{' '}
            trong {rangeLabel}.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          {RANGES.map((r) => {
            const active = r.key === rangeKey;
            return (
              <Button
                key={r.key}
                onClick={() => setRangeKey(r.key)}
                disabled={loading && active}
                sx={{
                  ...outlineButtonSx,
                  height: 38,
                  px: 2,
                  fontSize: 13,
                  bgcolor: active ? C.cyan : C.surface,
                  borderColor: active ? C.cyan : C.border,
                  color: T.title,
                  fontWeight: active ? 700 : 600,
                  '&:hover': { bgcolor: active ? C.cyanHover : C.borderLight }
                }}
              >
                {r.label}
              </Button>
            );
          })}

          <Tooltip title={updatedAt ? `Cập nhật lúc ${updatedAt.toLocaleTimeString('vi-VN')}` : 'Làm mới'}>
            <span>
              <IconButton
                onClick={() => load(rangeKey)}
                disabled={loading}
                sx={{ width: 38, height: 38, border: `1px solid ${C.border}`, borderRadius: 2.5, color: C.muted }}
              >
                <ReloadOutlined spin={loading} style={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }}
          action={
            <Button color="inherit" size="small" onClick={() => load(rangeKey)} sx={{ textTransform: 'none', fontWeight: 700 }}>
              Thử lại
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {/* SUMMARY CARDS */}
      <Grid container spacing={2.5}>
        {summaryStats.map((stat) => (
          <Grid key={stat.label} size={{ xs: 12, sm: 6, lg: 3 }}>
            <SummaryCard {...stat} loading={loading && !data} />
          </Grid>
        ))}
      </Grid>

      {loading && data && (
        <LinearProgress sx={{ mt: 2, borderRadius: 1, bgcolor: C.borderLight, '& .MuiLinearProgress-bar': { bgcolor: C.cyan } }} />
      )}

      {/* REVENUE CHART + CHANNEL SHARE */}
      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <DashboardCard
            title={owner ? 'Doanh thu theo ngày' : 'Doanh số của bạn theo ngày'}
            subtitle="Doanh thu thuần (đã thu tiền, trừ hoàn tiền) theo ngày đặt đơn, chia theo kênh bán"
          >
            {!data && loading ? (
              <Box sx={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CircularProgress sx={{ color: C.cyan }} />
              </Box>
            ) : hasRevenue ? (
              <BarChart
                height={300}
                xAxis={[{ scaleType: 'band', data: daily.map((d) => shortDate(d.date)) }]}
                yAxis={[{ valueFormatter: compactMoney, width: 56 }]}
                series={chartSeries}
                slotProps={{ legend: { position: { vertical: 'top', horizontal: 'end' } } }}
                margin={{ top: 40, right: 10, bottom: 10, left: 10 }}
              />
            ) : (
              <EmptyState message={`Chưa có doanh thu trong ${rangeLabel}. Biểu đồ sẽ hiển thị khi có đơn hàng đã thu tiền.`} />
            )}
          </DashboardCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <DashboardCard title="Tỷ trọng theo kênh" subtitle="Doanh thu thuần và số đơn mới của từng kênh">
            {/* Tổng + thanh tỷ trọng ghép 3 kênh */}
            <Box sx={{ mb: 2.5 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Tổng doanh thu thuần
              </Typography>
              <Typography sx={{ fontSize: 24, fontWeight: 800, color: T.title, letterSpacing: -0.5, mt: 0.25 }}>
                {sales ? money(sales.netRevenue) : '—'}
              </Typography>

              <Box
                sx={{
                  display: 'flex',
                  gap: '3px',
                  height: 10,
                  mt: 1.5,
                  borderRadius: 5,
                  overflow: 'hidden',
                  bgcolor: C.borderLight
                }}
              >
                {channelRows
                  .filter((c) => c.share > 0)
                  .map((c) => (
                    <Tooltip key={c.key} title={`${c.label}: ${c.share}%`}>
                      <Box sx={{ width: `${c.share}%`, minWidth: 6, bgcolor: c.color, transition: 'width 0.4s ease' }} />
                    </Tooltip>
                  ))}
              </Box>
            </Box>

            {/* Từng kênh */}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
              {channelRows.map((c) => {
                const empty = c.net === 0;
                return (
                  <Box
                    key={c.key}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      p: 1.5,
                      borderRadius: 2.5,
                      border: `1px solid ${C.borderLight}`,
                      bgcolor: empty ? C.surface : '#FAFCFE',
                      transition: 'border-color 0.2s ease',
                      '&:hover': { borderColor: C.border }
                    }}
                  >
                    {/* Icon kênh trên nền màu nhạt */}
                    <Box
                      sx={{
                        width: 38,
                        height: 38,
                        flexShrink: 0,
                        borderRadius: 2.5,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 17,
                        bgcolor: c.tint,
                        color: c.iconColor
                      }}
                    >
                      {c.icon}
                    </Box>

                    {/* Tên kênh + số đơn */}
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3 }} noWrap>
                        {c.label}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: C.muted, mt: 0.25 }} noWrap>
                        {sales ? `${count(c.orders)} đơn mới` : '—'}
                      </Typography>
                    </Box>

                    {/* Doanh thu + % */}
                    <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                      <Typography
                        sx={{ fontSize: 14, fontWeight: 800, color: empty ? T.subtle : T.title, lineHeight: 1.3, whiteSpace: 'nowrap' }}
                      >
                        {sales ? money(c.net) : '—'}
                      </Typography>
                      <Box
                        sx={{
                          display: 'inline-block',
                          mt: 0.4,
                          px: 0.9,
                          py: 0.1,
                          borderRadius: 1.5,
                          fontSize: 11.5,
                          fontWeight: 700,
                          bgcolor: empty ? C.borderLight : c.tint,
                          color: empty ? T.subtle : c.iconColor
                        }}
                      >
                        {sales ? `${c.share}%` : '—'}
                      </Box>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </DashboardCard>
        </Grid>
      </Grid>

      {/* TOP PRODUCTS + STOCK ALERTS + QUICK ACTIONS */}
      <Grid container spacing={2.5} sx={{ mt: 0.5 }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2.5}>
            <DashboardCard title="Sản phẩm bán chạy" subtitle={`Top 5 theo số lượng bán trên đơn đã thu tiền trong ${rangeLabel}`}>
              {data?.topProducts?.length ? (
                <Box sx={{ border: `1px solid ${C.border}`, borderRadius: 3, overflow: 'hidden' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {['#', 'Sản phẩm', 'Số lượng', 'Tiền hàng'].map((h, i) => (
                          <TableCell
                            key={h}
                            align={i >= 2 ? 'right' : 'left'}
                            sx={{
                              bgcolor: C.surface,
                              fontSize: 12,
                              fontWeight: 700,
                              letterSpacing: 0.5,
                              color: C.muted,
                              textTransform: 'uppercase',
                              py: 1.5
                            }}
                          >
                            {h}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.topProducts.map((p, index) => (
                        <TableRow key={p.productId} hover sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}>
                          <TableCell sx={{ py: 1.75, width: 48, fontWeight: 800, color: index === 0 ? T.cyanText : C.muted }}>
                            {index + 1}
                          </TableCell>
                          <TableCell sx={{ py: 1.75, fontSize: 13.5, fontWeight: 600, color: C.text }}>{p.productName}</TableCell>
                          <TableCell align="right" sx={{ py: 1.75, fontSize: 13.5, fontWeight: 700 }}>
                            {count(p.quantity)}
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1.75, fontSize: 13.5, color: C.muted }}>
                            {money(p.itemsAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Box>
              ) : (
                <EmptyState message={loading ? 'Đang tải...' : `Chưa có sản phẩm nào được bán trong ${rangeLabel}.`} />
              )}
              <Typography sx={{ fontSize: 12, color: T.subtle, mt: 1.25 }}>
                Tiền hàng = số lượng × đơn giá trên đơn, chưa trừ giảm giá cấp đơn.
              </Typography>
            </DashboardCard>

            {owner && (
              <DashboardCard title="Thông tin cửa hàng" subtitle="Đếm trực tiếp từ dữ liệu hiện tại">
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Stack spacing={1.75}>
                      <InfoRow
                        label="Sản phẩm đang bán"
                        value={shop ? `${count(shop.activeProducts)} sản phẩm` : '—'}
                        loading={loading && !data}
                      />
                      <InfoRow
                        label="Danh mục đang hoạt động"
                        value={shop ? `${count(shop.activeCategories)} danh mục` : '—'}
                        loading={loading && !data}
                      />
                    </Stack>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Stack spacing={1.75}>
                      <InfoRow
                        label="Biến thể bán online"
                        value={shop ? `${count(shop.onlineVariants)} biến thể` : '—'}
                        loading={loading && !data}
                      />
                      <InfoRow
                        label="Thành viên đang hoạt động"
                        value={shop ? `${count(shop.activeMembers)} người` : '—'}
                        loading={loading && !data}
                      />
                    </Stack>
                  </Grid>
                </Grid>
              </DashboardCard>
            )}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            {/* QUICK ACTIONS */}
            <DashboardCard title="Thao tác nhanh">
              <Stack spacing={1.5}>
                {owner ? (
                  <Button component={Link} to="/products/add" fullWidth startIcon={<PlusOutlined />} sx={primaryButtonSx}>
                    Thêm sản phẩm mới
                  </Button>
                ) : (
                  <Button component={Link} to="/in-store-sales" fullWidth startIcon={<ShopOutlined />} sx={primaryButtonSx}>
                    Bán tại quầy
                  </Button>
                )}
                <Grid container spacing={1.5}>
                  {quickActions.map((a) => (
                    <Grid key={a.to} size={{ xs: 6 }}>
                      <Button
                        component={Link}
                        to={a.to}
                        fullWidth
                        startIcon={a.icon}
                        sx={{ ...outlineButtonSx, fontSize: 13, height: 42, px: 1.5 }}
                      >
                        {a.label}
                      </Button>
                    </Grid>
                  ))}
                </Grid>
              </Stack>
            </DashboardCard>

            {/* STOCK ALERTS — cùng công thức với màn Tồn kho */}
            <DashboardCard title="Cảnh báo tồn kho" subtitle="Theo từng biến thể: hết hàng, hoặc có thể bán ≤ ngưỡng tối thiểu">
              {stock?.alerts?.length ? (
                <Stack divider={<Divider sx={{ borderColor: C.borderLight }} />} spacing={1.25}>
                  {stock.alerts.map((a) => {
                    const out = a.state === 'OUT';
                    return (
                      <Stack key={a.detailId} direction="row" spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box sx={{ minWidth: 0 }}>
                          <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text }} noWrap>
                            {a.productName}
                          </Typography>
                          <Typography sx={{ fontSize: 12, color: C.muted }}>
                            {a.size} / {a.color}
                            {!out && ` · Có thể bán ${count(a.sellable)} / ngưỡng ${count(a.minStock)}`}
                          </Typography>
                        </Box>
                        <Box
                          sx={{
                            flexShrink: 0,
                            borderRadius: 1.75,
                            fontSize: 12,
                            fontWeight: 600,
                            px: 1.25,
                            py: 0.35,
                            bgcolor: out ? '#FEE2E2' : T.cream,
                            color: out ? '#B91C1C' : T.creamText
                          }}
                        >
                          {out ? 'Hết hàng' : 'Sắp hết'}
                        </Box>
                      </Stack>
                    );
                  })}
                </Stack>
              ) : (
                <EmptyState message={loading && !data ? 'Đang kiểm tra tồn kho...' : 'Không có biến thể nào hết hoặc sắp hết hàng.'} />
              )}

              {stock && (
                <Stack spacing={0.75} sx={{ mt: 2 }}>
                  <Typography sx={{ fontSize: 12.5, color: C.muted }}>
                    Có thể bán: <strong>{count(stock.sellableUnits)}</strong> sản phẩm trên {count(stock.variants)} biến thể đang bán
                  </Typography>
                  {!stock.thresholdSupported && (
                    <Typography sx={{ fontSize: 12.5, color: T.creamText }}>
                      Database chưa có ngưỡng tồn tối thiểu (cần chạy migration 2026-11-06_inventory.sql) nên chưa báo được "sắp hết".
                    </Typography>
                  )}
                  {stock.thresholdSupported && toNumber(stock.noThreshold) > 0 && (
                    <Button
                      component={Link}
                      to="/warehouse/inventory?state=noThreshold"
                      endIcon={<ArrowRightOutlined />}
                      sx={{ ...linkButtonSx, alignSelf: 'flex-start' }}
                    >
                      {count(stock.noThreshold)} biến thể chưa đặt ngưỡng tối thiểu
                    </Button>
                  )}
                  <Button
                    component={Link}
                    to="/warehouse/inventory"
                    endIcon={<ArrowRightOutlined />}
                    sx={{ ...linkButtonSx, alignSelf: 'flex-start' }}
                  >
                    Mở màn hình Tồn kho
                  </Button>
                </Stack>
              )}
            </DashboardCard>
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}

// ==========================================
// WORKSPACE PAGE
// ==========================================

export default function WorkspacePage() {
  const { account } = useAuth();

  if (account?.role === 'OWNER' || account?.role === 'FAMILY_MEMBER') {
    return <StoreDashboard account={account} />;
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto', py: 4, color: C.text }}>
      <Typography variant="h3" sx={{ fontWeight: 800, color: T.title, fontSize: { xs: 22, sm: 26 }, mb: 1 }}>
        Xin chào, {account?.fullName || 'Người dùng'}
      </Typography>
      <Typography sx={{ fontSize: 13.5, color: C.muted, mb: 3 }}>Bạn đã đăng nhập thành công vào hệ thống quản lý THORS.</Typography>

      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography sx={{ fontSize: 14.5, color: '#334155', fontWeight: 500, mb: 3 }}>
            Lựa chọn nghiệp vụ quản trị phù hợp với vai trò của bạn bên dưới:
          </Typography>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <Button component={Link} to="/profile" sx={primaryButtonSx}>
              Hồ sơ cá nhân
            </Button>
            {account?.role === 'ADMIN' && (
              <Button component={Link} to="/accounts" sx={outlineButtonSx}>
                Quản lý tài khoản
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

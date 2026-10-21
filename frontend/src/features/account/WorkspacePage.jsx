
import { useEffect, useState } from 'react';
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
  Stack,
  Typography
} from '@mui/material';

import {
  AppstoreOutlined,
  DollarOutlined,
  PlusOutlined,
  ShoppingOutlined,
  TeamOutlined,
  WarningOutlined
} from '@ant-design/icons';

import { useAuth } from 'features/auth/AuthProvider';
import { getProductStatistics } from '../../services/productService';

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  yellowLight: '#FFFBE7'
};

const cardSx = {
  height: '100%',
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  boxShadow: 'none',
  bgcolor: '#FFFFFF'
};

// ==========================================
// DASHBOARD CARD
// ==========================================

function DashboardCard({ title, subtitle, children }) {
  return (
    <Card sx={cardSx}>
      <CardContent
        sx={{
          p: 2.5,
          '&:last-child': { pb: 2.5 }
        }}
      >
        <Stack spacing={0.5} sx={{ mb: 2 }}>
          <Typography
            fontSize={15}
            fontWeight={700}
            color={COLORS.text}
          >
            {title}
          </Typography>

          {subtitle && (
            <Typography
              fontSize={11}
              color={COLORS.muted}
            >
              {subtitle}
            </Typography>
          )}
        </Stack>

        {children}
      </CardContent>
    </Card>
  );
}

// ==========================================
// EMPTY STATE
// ==========================================

function EmptyState({ message }) {
  return (
    <Box
      sx={{
        minHeight: 180,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        bgcolor: '#FAFCFE',
        border: `1px dashed ${COLORS.border}`,
        borderRadius: 2,
        p: 3
      }}
    >
      <Typography
        fontSize={12}
        color={COLORS.muted}
      >
        {message}
      </Typography>
    </Box>
  );
}

// ==========================================
// SUMMARY CARD
// ==========================================

function SummaryCard({
  label,
  value,
  note,
  icon,
  highlight,
  loading
}) {
  return (
    <Card
      sx={{
        ...cardSx,
        bgcolor: highlight
          ? COLORS.yellowLight
          : '#FFFFFF'
      }}
    >
      <CardContent
        sx={{
          p: 2.5,
          '&:last-child': { pb: 2.5 }
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography
            fontSize={12}
            color={COLORS.muted}
          >
            {label}
          </Typography>

          <Box
            sx={{
              fontSize: 18,
              color: COLORS.text
            }}
          >
            {icon}
          </Box>
        </Stack>

        <Box
          sx={{
            mt: 1,
            minHeight: 42,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <Typography
              sx={{
                fontSize: 28,
                fontWeight: 500,
                color: COLORS.text
              }}
            >
              {value ?? '—'}
            </Typography>
          )}
        </Box>

        <Typography
          fontSize={11}
          color={COLORS.muted}
          sx={{ mt: 1 }}
        >
          {note}
        </Typography>
      </CardContent>
    </Card>
  );
}

// ==========================================
// SHOP OWNER DASHBOARD
// ==========================================

function OwnerDashboard({ account }) {
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ==========================================
  // LOAD REAL PRODUCT STATISTICS
  // ==========================================

  useEffect(() => {
    let active = true;

    async function loadStatistics() {
      try {
        setLoading(true);
        setError('');

        const data = await getProductStatistics();

        if (active) {
          setStatistics(data);
        }
      } catch (err) {
        if (active) {
          setError(
            err?.message ||
              'Unable to load product statistics.'
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadStatistics();

    return () => {
      active = false;
    };
  }, []);

  const firstName =
    account?.fullName?.trim().split(/\s+/)[0] ||
    'there';

  // ==========================================
  // SUMMARY STATISTICS
  // ==========================================

  const summaryStats = [
    {
      label: 'Total sales',
      value: null,
      note: 'Sales reporting is not available yet',
      icon: <DollarOutlined />,
      highlight: true,
      loading: false
    },
    {
      label: 'Orders',
      value: null,
      note: 'Order reporting is not available yet',
      icon: <ShoppingOutlined />,
      loading: false
    },
    {
      label: 'Active products',
      value: statistics?.activeProducts,
      note: 'Products currently active in your store',
      icon: <AppstoreOutlined />,
      loading
    },
    {
      label: 'Low-stock products',
      value: statistics?.lowStockProducts,
      note: 'Products with fewer than 5 units',
      icon: <WarningOutlined />,
      loading
    }
  ];

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

      {/* ======================================
          PAGE HEADER
      ====================================== */}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        alignItems={{
          xs: 'flex-start',
          sm: 'center'
        }}
        justifyContent="space-between"
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography
            fontSize={10}
            color={COLORS.muted}
            sx={{
              letterSpacing: 0.8,
              mb: 0.5
            }}
          >
            THORS STUDIO
          </Typography>

          <Typography
            variant="h3"
            sx={{
              fontSize: {
                xs: 24,
                md: 29
              },
              fontWeight: 500,
              color: COLORS.text
            }}
          >
            Shop Owner Dashboard
          </Typography>

          <Typography
            fontSize={12}
            color={COLORS.muted}
            sx={{ mt: 0.5 }}
          >
            Good morning, {firstName}. A clear
            view of your store, all in one place.
          </Typography>
        </Box>

        <Button
          component={Link}
          to="/products/add"
          variant="contained"
          startIcon={<PlusOutlined />}
          sx={{
            bgcolor: COLORS.cyan,
            color: COLORS.text,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: 'none',
            px: 2.5,
            '&:hover': {
              bgcolor: '#6DDDE9',
              boxShadow: 'none'
            }
          }}
        >
          Add Product
        </Button>
      </Stack>

      {/* ======================================
          API ERROR MESSAGE
      ====================================== */}

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2.5 }}
        >
          Failed to load product statistics:
          {' '}
          {error}
        </Alert>
      )}

      {/* ======================================
          SUMMARY CARDS
      ====================================== */}

      <Grid container spacing={2}>
        {summaryStats.map((stat) => (
          <Grid
            key={stat.label}
            size={{
              xs: 12,
              sm: 6,
              lg: 3
            }}
          >
            <SummaryCard {...stat} />
          </Grid>
        ))}
      </Grid>

      {/* ======================================
          SALES PERFORMANCE + QUICK ACTIONS
      ====================================== */}

      <Grid
        container
        spacing={2.5}
        sx={{ mt: 0.5 }}
      >
        <Grid size={{ xs: 12, lg: 8 }}>
          <DashboardCard
            title="Sales performance"
            subtitle="Daily revenue"
          >
            <EmptyState
              message="Sales data is not available yet. The chart will appear when sales reporting is connected."
            />
          </DashboardCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>

            {/* QUICK ACTIONS */}

            <DashboardCard title="Quick actions">
              <Stack spacing={1.5}>
                <Button
                  component={Link}
                  to="/products/add"
                  fullWidth
                  startIcon={<PlusOutlined />}
                  sx={{
                    bgcolor: COLORS.cyan,
                    color: COLORS.text,
                    textTransform: 'none',
                    fontWeight: 600,
                    '&:hover': {
                      bgcolor: '#6DDDE9'
                    }
                  }}
                >
                  Add Product
                </Button>

                <Stack
                  direction="row"
                  spacing={1}
                >
                  <Button
                    component={Link}
                    to="/categories"
                    variant="outlined"
                    fullWidth
                    sx={{
                      color: COLORS.text,
                      borderColor: COLORS.border,
                      textTransform: 'none',
                      fontSize: 12
                    }}
                  >
                    Add Category
                  </Button>

                  <Button
                    component={Link}
                    to="/accounts"
                    variant="outlined"
                    fullWidth
                    startIcon={<TeamOutlined />}
                    sx={{
                      color: COLORS.text,
                      borderColor: COLORS.border,
                      textTransform: 'none',
                      fontSize: 12
                    }}
                  >
                    Manage Staff
                  </Button>
                </Stack>

                <Typography
                  fontSize={11}
                  color={COLORS.muted}
                >
                  Keep your store ready for
                  what's next.
                </Typography>
              </Stack>
            </DashboardCard>

            {/* LOW STOCK NOTIFICATION */}

            <Box
              sx={{
                bgcolor: COLORS.yellowLight,
                borderRadius: 2,
                p: 2
              }}
            >
              <Typography
                fontSize={12}
                fontWeight={700}
                color={COLORS.text}
              >
                {loading
                  ? 'Checking inventory...'
                  : statistics
                    ? `${statistics.lowStockProducts} products need attention`
                    : 'Inventory status unavailable'}
              </Typography>

              <Typography
                fontSize={11}
                color={COLORS.muted}
                sx={{ mt: 1 }}
              >
                {statistics
                  ? 'Review products with low stock before they sell out.'
                  : 'Inventory statistics could not be loaded.'}
              </Typography>

              <Button
                component={Link}
                to="/products"
                size="small"
                sx={{
                  mt: 1,
                  px: 0,
                  textTransform: 'none',
                  color: COLORS.text
                }}
              >
                View Products
              </Button>
            </Box>
          </Stack>
        </Grid>
      </Grid>

      {/* ======================================
          TOP PRODUCTS + INVENTORY
      ====================================== */}

      <Grid
        container
        spacing={2.5}
        sx={{ mt: 0.5 }}
      >
        <Grid size={{ xs: 12, lg: 8 }}>
          <DashboardCard
            title="Top products"
            subtitle="Best-selling products"
          >
            <EmptyState
              message="Top-selling products will be displayed when sales data is available."
            />
          </DashboardCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <DashboardCard
            title="Inventory snapshot"
            subtitle="Current inventory overview"
          >
            <Stack spacing={2}>

              {/* AVAILABLE UNITS */}

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  fontSize={12}
                  color={COLORS.muted}
                >
                  Available units
                </Typography>

                {loading ? (
                  <CircularProgress size={18} />
                ) : (
                  <Typography
                    fontSize={13}
                    fontWeight={700}
                    color={COLORS.text}
                  >
                    {statistics?.availableUnits ?? '—'}
                  </Typography>
                )}
              </Stack>

              {/* ACTIVE PRODUCTS */}

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  fontSize={12}
                  color={COLORS.muted}
                >
                  Active products
                </Typography>

                {loading ? (
                  <CircularProgress size={18} />
                ) : (
                  <Typography
                    fontSize={13}
                    fontWeight={700}
                    color={COLORS.text}
                  >
                    {statistics?.activeProducts ?? '—'}
                  </Typography>
                )}
              </Stack>

              {/* LOW STOCK PRODUCTS */}

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  fontSize={12}
                  color={COLORS.muted}
                >
                  Low-stock products
                </Typography>

                {loading ? (
                  <CircularProgress size={18} />
                ) : (
                  <Typography
                    fontSize={13}
                    fontWeight={700}
                    color={COLORS.text}
                  >
                    {statistics?.lowStockProducts ?? '—'}
                  </Typography>
                )}
              </Stack>

              {/* OTHER STATISTICS */}

              <Divider />

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  fontSize={12}
                  color={COLORS.muted}
                >
                  Active categories
                </Typography>

                <Typography
                  fontSize={12}
                  color={COLORS.muted}
                >
                  Not available
                </Typography>
              </Stack>

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  fontSize={12}
                  color={COLORS.muted}
                >
                  Staff & family
                </Typography>

                <Typography
                  fontSize={12}
                  color={COLORS.muted}
                >
                  Not available
                </Typography>
              </Stack>

              <Divider />

              <Box
                sx={{
                  bgcolor: COLORS.cyanLight,
                  borderRadius: 1.5,
                  px: 1.5,
                  py: 1
                }}
              >
                <Typography
                  fontSize={11}
                  fontWeight={600}
                  color={COLORS.text}
                >
                  Online storefront
                </Typography>

                <Typography
                  fontSize={11}
                  color={COLORS.muted}
                  sx={{ mt: 0.5 }}
                >
                  Status not available
                </Typography>
              </Box>

            </Stack>
          </DashboardCard>
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

  if (account?.role === 'OWNER') {
    return <OwnerDashboard account={account} />;
  }

  return (
    <Box sx={{ maxWidth: 1000, mx: 'auto' }}>
      <Typography
        variant="h4"
        sx={{ mb: 2 }}
      >
        Welcome, {account?.fullName || 'User'}
      </Typography>

      <Card sx={cardSx}>
        <CardContent>
          <Typography sx={{ mb: 2 }}>
            You have successfully signed in
            to THORS.
          </Typography>

          <Stack
            direction={{
              xs: 'column',
              sm: 'row'
            }}
            spacing={2}
          >
            <Button
              component={Link}
              to="/profile"
              variant="contained"
            >
              View Profile
            </Button>

            {account?.role === 'ADMIN' && (
              <Button
                component={Link}
                to="/accounts"
                variant="outlined"
              >
                Manage Accounts
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

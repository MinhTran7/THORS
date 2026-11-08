import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

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
  WarningOutlined,
  ArrowRightOutlined
} from '@ant-design/icons';

import { useAuth } from 'features/auth/AuthProvider';
import { getProductStatistics } from '../../services/productService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from '../customer/theme';

// ==========================================
// DASHBOARD CARD
// ==========================================

function DashboardCard({ title, subtitle, children }) {
  return (
    <Card sx={{ ...cardSx, height: '100%' }}>
      <CardContent
        sx={{
          p: { xs: 2.5, sm: 3.5 },
          '&:last-child': { pb: { xs: 2.5, sm: 3.5 } }
        }}
      >
        <Stack spacing={0.5} sx={{ mb: 2.5 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: 16,
              color: '#0F172A'
            }}
          >
            {title}
          </Typography>

          {subtitle && (
            <Typography
              sx={{
                fontSize: 13,
                color: C.muted
              }}
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
        bgcolor: '#F8FAFC',
        border: `1.5px dashed ${C.border}`,
        borderRadius: 3,
        p: 3
      }}
    >
      <Typography
        sx={{
          fontSize: 13.5,
          color: C.muted,
          maxWidth: 420,
          mx: 'auto',
          lineHeight: 1.6
        }}
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
        bgcolor: highlight ? '#F0FCFE' : C.surface,
        border: `1.5px solid ${highlight ? C.cyan : C.border}`,
        transition: 'all 0.2s ease',
        '&:hover': {
          boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
          borderColor: highlight ? C.cyanHover : '#CBD5E1'
        }
      }}
    >
      <CardContent
        sx={{
          p: { xs: 2.5, sm: 3 },
          '&:last-child': { pb: { xs: 2.5, sm: 3 } }
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
        >
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              color: C.muted
            }}
          >
            {label}
          </Typography>

          <Box
            sx={{
              width: 40,
              height: 40,
              borderRadius: 2.5,
              bgcolor: highlight ? C.cyan : C.borderLight,
              color: '#0F172A',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 18
            }}
          >
            {icon}
          </Box>
        </Stack>

        <Box
          sx={{
            mt: 1.5,
            minHeight: 44,
            display: 'flex',
            alignItems: 'center'
          }}
        >
          {loading ? (
            <CircularProgress size={24} sx={{ color: C.cyan }} />
          ) : (
            <Typography
              sx={{
                fontSize: 28,
                fontWeight: 800,
                color: '#0F172A',
                letterSpacing: -0.5
              }}
            >
              {value ?? '—'}
            </Typography>
          )}
        </Box>

        <Typography
          sx={{
            fontSize: 12.5,
            color: C.muted,
            mt: 1,
            lineHeight: 1.5
          }}
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
  const navigate = useNavigate();
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
            err?.message || 'Không thể tải số liệu thống kê sản phẩm.'
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
    account?.fullName?.trim().split(/\s+/).slice(-1)[0] ||
    'bạn';

  // ==========================================
  // SUMMARY STATISTICS
  // ==========================================

  const summaryStats = [
    {
      label: 'Doanh thu bán hàng',
      value: null,
      note: 'Báo cáo doanh thu đang được tích hợp',
      icon: <DollarOutlined />,
      highlight: true,
      loading: false
    },
    {
      label: 'Đơn hàng mới',
      value: null,
      note: 'Báo cáo đơn hàng đang được tích hợp',
      icon: <ShoppingOutlined />,
      loading: false
    },
    {
      label: 'Sản phẩm hoạt động',
      value: statistics?.activeProducts,
      note: 'Số lượng sản phẩm sẵn sàng mở bán',
      icon: <AppstoreOutlined />,
      loading
    },
    {
      label: 'Sản phẩm sắp hết hàng',
      value: statistics?.lowStockProducts,
      note: 'Sản phẩm có tồn kho dưới 5 cái',
      icon: <WarningOutlined style={{ color: '#D97706' }} />,
      loading
    }
  ];

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 6, color: C.text }}>
      {/* PAGE HEADER */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 2,
          mb: 3.5
        }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: 11.5,
              fontWeight: 800,
              color: '#0D9488',
              letterSpacing: 1,
              mb: 0.5,
              textTransform: 'uppercase'
            }}
          >
            HỆ THỐNG QUẢN LÝ THORS
          </Typography>

          <Typography
            variant="h3"
            sx={{
              fontSize: { xs: 22, sm: 26 },
              fontWeight: 800,
              color: '#0F172A'
            }}
          >
            Bảng điều khiển tổng quan
          </Typography>

          <Typography
            sx={{
              fontSize: 13.5,
              color: C.muted,
              mt: 0.5,
              lineHeight: 1.6
            }}
          >
            Xin chào, <strong>{firstName}</strong>! Dưới đây là tổng hợp nhanh các chỉ số hoạt động của cửa hàng.
          </Typography>
        </Box>
      </Box>

      {/* API ERROR MESSAGE */}
      {error && (
        <Alert
          severity="error"
          sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }}
        >
          Không thể tải số liệu thống kê: {error}
        </Alert>
      )}

      {/* SUMMARY CARDS */}
      <Grid container spacing={2.5}>
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

      {/* SALES PERFORMANCE + QUICK ACTIONS */}
      <Grid
        container
        spacing={2.5}
        sx={{ mt: 0.5 }}
      >
        <Grid size={{ xs: 12, lg: 8 }}>
          <DashboardCard
            title="Hiệu suất bán hàng"
            subtitle="Biểu đồ doanh thu theo thời gian thực"
          >
            <EmptyState
              message="Dữ liệu bán hàng đang được kết nối. Biểu đồ doanh thu sẽ tự động hiển thị ngay khi phát sinh giao dịch."
            />
          </DashboardCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5}>
            {/* QUICK ACTIONS */}
            <DashboardCard title="Thao tác nhanh">
              <Stack spacing={1.5}>
                <Button
                  component={Link}
                  to="/products/add"
                  fullWidth
                  startIcon={<PlusOutlined />}
                  sx={primaryButtonSx}
                >
                  Thêm sản phẩm mới
                </Button>

                <Stack
                  direction="row"
                  spacing={1.5}
                >
                  <Button
                    component={Link}
                    to="/categories"
                    fullWidth
                    sx={{
                      ...outlineButtonSx,
                      fontSize: 13,
                      height: 42
                    }}
                  >
                    Danh mục
                  </Button>

                  <Button
                    component={Link}
                    to="/family"
                    fullWidth
                    startIcon={<TeamOutlined />}
                    sx={{
                      ...outlineButtonSx,
                      fontSize: 13,
                      height: 42
                    }}
                  >
                    Thành viên
                  </Button>
                </Stack>

                <Typography
                  sx={{
                    fontSize: 12.5,
                    color: C.muted,
                    mt: 0.5,
                    lineHeight: 1.5
                  }}
                >
                  Truy cập nhanh các nghiệp vụ quản lý quan trọng của cửa hàng.
                </Typography>
              </Stack>
            </DashboardCard>

            {/* LOW STOCK NOTIFICATION (PHUOC'S NOTE STYLE) */}
            <Box
              sx={{
                bgcolor: '#FFFDE7',
                border: '1.5px solid #FDE047',
                borderRadius: 3,
                p: 2.5
              }}
            >
              <Typography
                sx={{
                  fontWeight: 800,
                  fontSize: 14,
                  color: '#854D0E'
                }}
              >
                {loading
                  ? 'Đang kiểm tra tồn kho...'
                  : statistics
                    ? `${statistics.lowStockProducts} sản phẩm sắp hết hàng`
                    : 'Chưa có thông tin tồn kho'}
              </Typography>

              <Typography
                sx={{
                  fontSize: 12.5,
                  color: '#713F12',
                  mt: 0.5,
                  lineHeight: 1.6
                }}
              >
                {statistics
                  ? 'Kiểm tra và lên kế hoạch nhập hàng trước khi sản phẩm bị gián đoạn bán ra.'
                  : 'Không thể tải dữ liệu kiểm kho tại thời điểm này.'}
              </Typography>

              <Button
                component={Link}
                to="/products"
                endIcon={<ArrowRightOutlined />}
                sx={{
                  mt: 1.5,
                  p: 0,
                  textTransform: 'none',
                  color: '#854D0E',
                  fontWeight: 700,
                  fontSize: 13,
                  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' }
                }}
              >
                Xem danh sách sản phẩm
              </Button>
            </Box>
          </Stack>
        </Grid>
      </Grid>

      {/* TOP PRODUCTS + INVENTORY */}
      <Grid
        container
        spacing={2.5}
        sx={{ mt: 0.5 }}
      >
        <Grid size={{ xs: 12, lg: 8 }}>
          <DashboardCard
            title="Sản phẩm bán chạy"
            subtitle="Top các mặt hàng có sản lượng xuất kho cao nhất"
          >
            <EmptyState
              message="Danh sách sản phẩm bán chạy nhất sẽ được xếp hạng tự động tại đây khi có dữ liệu bán lẻ."
            />
          </DashboardCard>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <DashboardCard
            title="Tóm tắt kho hàng"
            subtitle="Tổng quan kiểm kê tồn kho thời gian thực"
          >
            <Stack spacing={2}>
              {/* AVAILABLE UNITS */}
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  sx={{
                    fontSize: 13.5,
                    color: C.muted
                  }}
                >
                  Tổng tồn khả dụng
                </Typography>

                {loading ? (
                  <CircularProgress size={18} sx={{ color: C.cyan }} />
                ) : (
                  <Typography
                    sx={{
                      fontSize: 14.5,
                      fontWeight: 800,
                      color: '#0F172A'
                    }}
                  >
                    {statistics?.availableUnits ? `${statistics.availableUnits} cái` : '—'}
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
                  sx={{
                    fontSize: 13.5,
                    color: C.muted
                  }}
                >
                  Sản phẩm đang bán
                </Typography>

                {loading ? (
                  <CircularProgress size={18} sx={{ color: C.cyan }} />
                ) : (
                  <Typography
                    sx={{
                      fontSize: 14.5,
                      fontWeight: 800,
                      color: '#0F172A'
                    }}
                  >
                    {statistics?.activeProducts ? `${statistics.activeProducts} mặt hàng` : '—'}
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
                  sx={{
                    fontSize: 13.5,
                    color: C.muted
                  }}
                >
                  Sắp hết hàng
                </Typography>

                {loading ? (
                  <CircularProgress size={18} sx={{ color: C.cyan }} />
                ) : (
                  <Typography
                    sx={{
                      fontSize: 14.5,
                      fontWeight: 800,
                      color: statistics?.lowStockProducts > 0 ? '#D97706' : '#0F172A'
                    }}
                  >
                    {statistics?.lowStockProducts ? `${statistics.lowStockProducts} mặt hàng` : '0'}
                  </Typography>
                )}
              </Stack>

              <Divider sx={{ borderColor: C.borderLight }} />

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  sx={{
                    fontSize: 13.5,
                    color: C.muted
                  }}
                >
                  Danh mục sản phẩm
                </Typography>

                <Typography
                  sx={{
                    fontSize: 13,
                    color: C.muted
                  }}
                >
                  Đang hoạt động
                </Typography>
              </Stack>

              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
              >
                <Typography
                  sx={{
                    fontSize: 13.5,
                    color: C.muted
                  }}
                >
                  Thành viên quản lý
                </Typography>

                <Typography
                  sx={{
                    fontSize: 13,
                    color: C.muted
                  }}
                >
                  Đang hoạt động
                </Typography>
              </Stack>

              <Divider sx={{ borderColor: C.borderLight }} />

              {/* ONLINE STOREFRONT NOTE (PHUOC'S TEAL BOX) */}
              <Box
                sx={{
                  bgcolor: '#F0FDFA',
                  borderRadius: 2.5,
                  p: 2,
                  border: '1px solid #99F6E4'
                }}
              >
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#0F766E'
                  }}
                >
                  Kênh bán lẻ Online (Website)
                </Typography>

                <Typography
                  sx={{
                    fontSize: 12,
                    color: '#115E59',
                    mt: 0.5,
                    lineHeight: 1.5
                  }}
                >
                  Đang kết nối đồng bộ kho trực tiếp với THORS Studio.
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
    <Box sx={{ maxWidth: 1000, mx: 'auto', py: 4, color: C.text }}>
      <Typography
        variant="h3"
        sx={{
          fontWeight: 800,
          color: '#0F172A',
          fontSize: { xs: 22, sm: 26 },
          mb: 1
        }}
      >
        Xin chào, {account?.fullName || 'Người dùng'}
      </Typography>
      <Typography sx={{ fontSize: 13.5, color: C.muted, mb: 3 }}>
        Bạn đã đăng nhập thành công vào hệ thống quản lý THORS.
      </Typography>

      <Card sx={cardSx}>
        <CardContent sx={{ p: { xs: 2.5, sm: 4 } }}>
          <Typography sx={{ fontSize: 14.5, color: '#334155', fontWeight: 500, mb: 3 }}>
            Lựa chọn nghiệp vụ quản trị phù hợp với vai trò của bạn bên dưới:
          </Typography>

          <Stack
            direction={{
              xs: 'column',
              sm: 'row'
            }}
            spacing={1.5}
          >
            <Button
              component={Link}
              to="/profile"
              sx={primaryButtonSx}
            >
              Hồ sơ cá nhân
            </Button>
            {account?.role === 'ADMIN' && (
              <Button component={Link} to="/accounts" sx={outlineButtonSx}>
                Quản lý tài khoản
              </Button>
            )}
            {account?.role === 'OWNER' && (
              <Button component={Link} to="/family" sx={outlineButtonSx}>
                Quản lý thành viên gia đình
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}

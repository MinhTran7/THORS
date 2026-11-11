import { useCallback, useEffect, useMemo, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {
  Alert,
  Avatar,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  IconButton,
  InputAdornment,
  ListItemIcon,
  Menu,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
  MenuItem
} from '@mui/material';
import { Pager } from 'features/account/components/Blocks';

import {
  EditOutlined,
  EllipsisOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  GlobalOutlined,
  FileExcelOutlined,
  PlusOutlined,
  SearchOutlined
} from '@ant-design/icons';

import { getProducts, changeProductStatus, setProductOnline } from '../../services/productService';

import { categoryFullName, getCategories, sortCategoriesAsTree } from '../../services/categoryService';
import { primaryButtonSx, outlineButtonSx } from '../customer/theme';
import ProductExcelDialog from './ProductExcelDialog';

const C = {
  text: '#1E293B',
  muted: '#64748B',
  subtle: '#94A3B8',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  cyan: '#8EECF5',
  cyanHover: '#76E5EF',
  cyanText: '#0E7490',
  cream: '#FFF7AE',
  creamHover: '#FFF294',
  creamText: '#713F12',
  error: '#EF4444'
};

const PAGE_SIZE = 8;

const chipSx = (bg, color) => ({
  display: 'inline-flex',
  alignItems: 'center',
  px: 1.5,
  py: 0.35,
  borderRadius: 1.75,
  fontSize: 13,
  fontWeight: 600,
  bgcolor: bg,
  color
});

const filterSelectSx = {
  bgcolor: C.surface,
  borderRadius: 2.5,
  height: 44,
  fontSize: 13.5,
  '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
  '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan }
};

function formatPrice(price) {
  if (price === null || price === undefined) {
    return '—';
  }

  const value = Number(price);

  if (!Number.isFinite(value)) {
    return '—';
  }

  return `${value.toLocaleString('vi-VN')} ₫`;
}

function displayPrice(product) {
  const { minPrice, maxPrice } = product;

  if (minPrice == null) {
    return '—';
  }

  if (maxPrice == null || Number(minPrice) === Number(maxPrice)) {
    return formatPrice(minPrice);
  }

  return `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
}

function isOnlineProduct(product) {
  return product.status === 'ACTIVE' && Number(product.onlineVariantCount || 0) > 0;
}

// Trạng thái tồn theo từng biến thể đang hoạt động (backend tính):
// - hết hàng   = tồn 0 và đã từng có hàng (có dòng thẻ kho)
// - chưa nhập  = tồn 0 và chưa từng có biến động kho nào
// - sắp hết    = có thể bán (tồn − đang giữ) ≤ ngưỡng tối thiểu (chưa đặt ngưỡng thì mặc định 5)
// Sản phẩm lấy mức nặng nhất: OUT (mọi biến thể đều không còn hàng) > LOW > INFO (chỉ có biến thể chưa nhập);
// NEW = mọi biến thể đều chưa nhập hàng.
function stockAlert(product) {
  const active = Number(product.activeVariantCount || 0);
  const out = Number(product.outOfStockVariantCount || 0);
  const low = Number(product.lowStockVariantCount || 0);
  const never = Number(product.neverStockedVariantCount || 0);

  if (product.status !== 'ACTIVE' || active === 0) return null;
  if (never === active) return { level: 'NEW', label: 'Chưa nhập hàng lần nào' };

  const parts = [];
  if (out > 0) parts.push(`${out} hết`);
  if (low > 0) parts.push(`${low} sắp hết`);
  if (never > 0) parts.push(`${never} chưa nhập`);
  const detail = active > 1 ? ` (${active} biến thể: ${parts.join(' · ')})` : '';

  if (out + never === active) return { level: 'OUT', label: `Hết hàng${detail}` };
  if (out > 0 || low > 0) return { level: 'LOW', label: `Sắp hết${detail}` };
  if (never > 0) return { level: 'INFO', label: `${never}/${active} biến thể chưa nhập hàng` };
  return null;
}

// Cần nhập hàng = đã bán hết hoặc sắp hết (không gồm sản phẩm chưa nhập hàng lần nào)
const needsRestock = (product) => ['OUT', 'LOW'].includes(stockAlert(product)?.level);

// Bỏ dấu tiếng Việt để tìm "ao thun" ra "Áo thun"
function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function normalizeCategories(response) {
  if (Array.isArray(response)) {
    return response;
  }

  if (Array.isArray(response?.content)) {
    return response.content;
  }

  if (Array.isArray(response?.data)) {
    return response.data;
  }

  return [];
}

export default function ProductPage() {
  const navigate = useNavigate();

  // ==========================================
  // STATES - DATA
  // ==========================================

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);

  // ==========================================
  // STATES - SEARCH AND FILTER
  // ==========================================

  const [activeTab, setActiveTab] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  // ==========================================
  // STATES - PAGINATION
  // ==========================================

  const [page, setPage] = useState(1);

  // Menu "⋯" của từng dòng (ẩn/hiện sản phẩm, bật/tắt bán online)
  const [menuAnchor, setMenuAnchor] = useState(null);
  const [menuProduct, setMenuProduct] = useState(null);

  // ==========================================
  // STATES - CHANGE PRODUCT STATUS / ONLINE
  // ==========================================

  const [statusDialogProduct, setStatusDialogProduct] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [onlineDialogProduct, setOnlineDialogProduct] = useState(null);
  const [onlineSaving, setOnlineSaving] = useState(false);
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);

  // Không xóa sản phẩm từ danh sách: sản phẩm ngừng bán thì chuyển sang "Đã ẩn" để giữ lịch sử
  const busy = statusSaving || onlineSaving;

  // ==========================================
  // LOAD PRODUCTS
  // ==========================================

  const loadProducts = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError('');

      const data = await getProducts();

      if (!Array.isArray(data)) {
        throw new Error('Dữ liệu sản phẩm trả về không hợp lệ.');
      }

      setProducts(data);
      setLoadedAt(new Date());
    } catch (err) {
      setError(err?.message || 'Không thể tải danh sách sản phẩm. Vui lòng thử lại.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // ==========================================
  // LOAD CATEGORIES
  // ==========================================

  const loadCategories = useCallback(async () => {
    try {
      const response = await getCategories();
      setCategories(sortCategoriesAsTree(normalizeCategories(response)));
    } catch (err) {
      setError(err?.message || 'Không thể tải danh mục sản phẩm.');
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, [loadProducts, loadCategories]);

  // ==========================================
  // STATISTICS
  // ==========================================

  const tabMatchers = useMemo(
    () => ({
      ACTIVE: (product) => product.status === 'ACTIVE',
      INACTIVE: (product) => product.status === 'INACTIVE',
      ONLINE: isOnlineProduct,
      LOW_STOCK: needsRestock,
      ALL: () => true
    }),
    []
  );

  const tabCounts = useMemo(() => {
    const counts = {};
    Object.entries(tabMatchers).forEach(([key, match]) => {
      counts[key] = products.filter(match).length;
    });
    return counts;
  }, [products, tabMatchers]);

  // ==========================================
  // SEARCH AND FILTER
  // ==========================================

  // categoryId (chuỗi) -> id danh mục cha (để lọc theo nhánh nhiều cấp)
  const categoryParentMap = useMemo(
    () => new Map(categories.filter((c) => c.parentId).map((c) => [String(c.categoryId), c.parentId])),
    [categories]
  );

  // Sản phẩm thuộc danh mục đang lọc hoặc bất kỳ danh mục con / cháu nào của nó
  const inCategoryBranch = (categoryId, branchId) => {
    let cursor = String(categoryId ?? '');
    for (let depth = 0; cursor && depth < 50; depth++) {
      if (cursor === branchId) return true;
      cursor = String(categoryParentMap.get(cursor) ?? '');
    }
    return false;
  };

  const filteredProducts = useMemo(() => {
    const keyword = normalizeText(search);
    // "#12" hoặc "12": khớp đúng mã sản phẩm (không khớp 112, 120...)
    const idMatch = keyword.match(/^#?(\d+)$/);
    const matchTab = tabMatchers[activeTab] ?? tabMatchers.ALL;

    const matched = products.filter((product) => {
      const matchesSearch =
        !keyword ||
        (idMatch && String(product.productId) === idMatch[1]) ||
        normalizeText(product.productName).includes(keyword) ||
        normalizeText(product.sku).includes(keyword) ||
        normalizeText(product.searchText).includes(keyword);

      // Lọc theo danh mục cha thì lấy cả sản phẩm của các danh mục con, cháu…
      const matchesCategory = categoryFilter === 'ALL' || inCategoryBranch(product.categoryId, categoryFilter);

      return matchesSearch && matchesCategory && matchTab(product);
    });
    // Tab "Cần nhập hàng": sản phẩm đã hết lên đầu, sắp hết xếp sau
    if (activeTab === 'LOW_STOCK') {
      const rank = (product) => (stockAlert(product)?.level === 'OUT' ? 0 : 1);
      return [...matched].sort((a, b) => rank(a) - rank(b));
    }
    return matched;
  }, [products, search, categoryFilter, activeTab, tabMatchers, categoryParentMap]);

  // ==========================================
  // PAGINATION
  // ==========================================

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

  function resetPage() {
    setPage(1);
  }

  function changeTab(value) {
    if (busy) return;
    setActiveTab(value);
    resetPage();
  }


  // ==========================================
  // NAVIGATION
  // ==========================================

  function viewProduct(productId) {
    if (busy) return;
    navigate(`/products/${productId}`);
  }

  // ==========================================
  // CHANGE PRODUCT STATUS
  // ==========================================

  function openStatusDialog(product) {
    if (busy || !product) return;

    setError('');
    setSuccess('');
    setStatusDialogProduct(product);
  }

  function closeStatusDialog() {
    if (statusSaving) return;
    setStatusDialogProduct(null);
  }

  async function confirmChangeProductStatus() {
    if (!statusDialogProduct || statusSaving) return;

    const productId = statusDialogProduct.productId;
    const currentStatus = statusDialogProduct.status;
    const newStatus = currentStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';

    try {
      setStatusSaving(true);
      setError('');
      setSuccess('');

      await changeProductStatus(productId, newStatus);

      setProducts((previous) => previous.map((product) => (product.productId === productId ? { ...product, status: newStatus } : product)));

      setStatusDialogProduct(null);
      setSuccess(newStatus === 'ACTIVE' ? 'Đã kích hoạt sản phẩm thành công.' : 'Đã ẩn sản phẩm thành công.');

      await loadProducts({ silent: true });
    } catch (err) {
      setError(err?.message || 'Không thể đổi trạng thái sản phẩm. Vui lòng thử lại.');
      setStatusDialogProduct(null);
    } finally {
      setStatusSaving(false);
    }
  }

  // ==========================================
  // BÁN ONLINE (bật/tắt cho mọi biến thể đang hoạt động)
  // ==========================================

  function openOnlineDialog(product) {
    if (busy || !product) return;

    setError('');
    setSuccess('');
    setOnlineDialogProduct(product);
  }

  function closeOnlineDialog() {
    if (onlineSaving) return;
    setOnlineDialogProduct(null);
  }

  async function confirmToggleOnline() {
    if (!onlineDialogProduct || onlineSaving) return;

    const product = onlineDialogProduct;
    const enable = !isOnlineProduct(product);

    try {
      setOnlineSaving(true);
      setError('');
      setSuccess('');

      const result = await setProductOnline(product.productId, enable);

      setProducts((previous) =>
        previous.map((item) =>
          item.productId === product.productId ? { ...item, onlineVariantCount: Number(result?.onlineVariantCount ?? 0) } : item
        )
      );

      setOnlineDialogProduct(null);
      setSuccess(
        enable
          ? `Đã bật bán online cho "${product.productName}" (${result?.onlineVariantCount ?? 0}/${result?.variantCount ?? 0} biến thể).`
          : `Đã tắt bán online cho "${product.productName}".`
      );
    } catch (err) {
      setError(err?.message || 'Không thể đổi trạng thái bán online. Vui lòng thử lại.');
      setOnlineDialogProduct(null);
    } finally {
      setOnlineSaving(false);
    }
  }

  // ==========================================
  // RENDER
  // ==========================================

  const onlineTarget = onlineDialogProduct;
  const enablingOnline = onlineTarget ? !isOnlineProduct(onlineTarget) : false;

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto', pb: 6, color: C.text }}>
      {/* HEADER */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          mb: 3.5
        }}
      >
        <Box>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
              color: '#0F172A',
              fontSize: { xs: 22, sm: 26 }
            }}
          >
            Danh sách sản phẩm
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: C.muted, mt: 0.5, lineHeight: 1.6 }}>
            Quản lý tồn kho, giá bán và trạng thái mở bán online cho các sản phẩm
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">

          <Button startIcon={<FileExcelOutlined />} disabled={busy} onClick={() => setExcelDialogOpen(true)} sx={outlineButtonSx}>
            Nhập từ Excel
          </Button>

          <Button startIcon={<PlusOutlined />} disabled={busy} onClick={() => navigate('/products/add')} sx={primaryButtonSx}>
            Thêm sản phẩm
          </Button>
        </Stack>
      </Box>

      {/* ERROR MESSAGE */}
      {error && (
        <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* SUCCESS MESSAGE — nổi ở góc dưới, tự ẩn, không làm bảng bị đẩy xuống */}
      <Snackbar
        open={Boolean(success)}
        autoHideDuration={3500}
        onClose={(_, reason) => {
          if (reason !== 'clickaway') setSuccess('');
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setSuccess('')}
          sx={{ borderRadius: 2.5, fontSize: 13.5, fontWeight: 600, bgcolor: '#168B70', boxShadow: '0 8px 24px rgba(15,23,42,0.18)' }}
        >
          {success}
        </Alert>
      </Snackbar>

      {/* QUICK FILTER TABS */}
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        {[
          { key: 'ACTIVE', label: 'Đang bán' },
          { key: 'LOW_STOCK', label: 'Cần nhập hàng' },
          { key: 'INACTIVE', label: 'Đã ẩn' },
          { key: 'ALL', label: 'Tất cả' }
        ].map((tab) => {
          const selected = activeTab === tab.key;

          return (
            <Button
              key={tab.key}
              disabled={busy}
              onClick={() => changeTab(tab.key)}
              sx={{
                textTransform: 'none',
                height: 36,
                px: 2,
                borderRadius: 2.5,
                fontSize: 13,
                fontWeight: selected ? 800 : 600,
                bgcolor: selected ? C.cyan : C.surface,
                color: '#0F172A',
                border: `1px solid ${selected ? C.cyanHover : C.border}`,
                boxShadow: selected ? '0 2px 8px rgba(142, 236, 245, 0.4)' : 'none',
                '&:hover': {
                  bgcolor: selected ? C.cyanHover : C.borderLight,
                  borderColor: selected ? C.cyanHover : '#CBD5E1'
                }
              }}
            >
              {tab.label} ({loading ? '—' : tabCounts[tab.key]})
            </Button>
          );
        })}
      </Stack>

      {/* TÌM KIẾM + DANH MỤC trên một hàng (trạng thái lọc bằng các tab phía trên) */}
      <Box
        sx={{
          mb: 2.5,
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(240px, 1fr) 260px' },
          gap: 1.5,
          alignItems: 'center'
        }}
      >
        <TextField
          fullWidth
          size="small"
          disabled={busy}
          // Vẫn tìm được theo mã #ID, mã vạch, size, màu — chỉ gợi ý 2 cách hay dùng nhất
          placeholder="Tìm theo tên sản phẩm hoặc mã vạch..."
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetPage();
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                </InputAdornment>
              )
            }
          }}
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: C.surface,
              borderRadius: 2.5,
              height: 42,
              fontSize: 13.5,
              '& fieldset': { borderColor: C.border },
              '&:hover fieldset': { borderColor: C.cyan },
              '&.Mui-focused fieldset': { borderColor: C.cyan }
            }
          }}
        />

        <Select
          fullWidth
          size="small"
          disabled={busy}
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            resetPage();
          }}
          MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
          sx={{ ...filterSelectSx, height: 42 }}
        >
          <MenuItem value="ALL">Tất cả danh mục</MenuItem>
          {categories.map((category) => (
            <MenuItem key={category.categoryId} value={String(category.categoryId)} sx={{ pl: 2 + (category.depth || 0) * 2 }}>
              {category.parentId ? categoryFullName(category) : category.categoryName}
              {category.status !== 'ACTIVE' ? ' (Đã ngưng)' : ''}
            </MenuItem>
          ))}
        </Select>
      </Box>

      {/* ─── KHỐI BẢNG DANH SÁCH SẢN PHẨM ─── */}
      <Box
        sx={{
          bgcolor: C.surface,
          borderRadius: 3.5,
          border: `1px solid ${C.border}`,
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
          overflow: 'hidden'
        }}
      >
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            sx={{
              minWidth: 760,
              // Cố định độ rộng cột: đổi tab / ẩn / bật online không làm bảng xê dịch
              tableLayout: 'fixed',
              '& th': {
                bgcolor: C.surface,
                color: C.muted,
                fontSize: 12,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                py: 1.75,
                borderBottom: `1px solid ${C.borderLight}`
              },
              '& td': {
                borderColor: C.borderLight,
                py: 2,
                fontSize: 13.5,
                color: C.text
              }
            }}
          >
            {/* TABLE HEADER */}
            <TableHead>
              <TableRow>
                <TableCell sx={{ pl: 3 }}>SẢN PHẨM</TableCell>
                <TableCell sx={{ width: 200 }}>GIÁ BÁN</TableCell>
                <TableCell sx={{ width: 130 }}>TỒN KHO</TableCell>
                <TableCell sx={{ width: 190 }}>TRẠNG THÁI</TableCell>
                <TableCell align="right" sx={{ pr: 3, width: 110 }} />
              </TableRow>
            </TableHead>

            {/* TABLE BODY */}
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    <Stack alignItems="center" spacing={1.5}>
                      <CircularProgress size={32} sx={{ color: C.cyan }} />
                      <Typography fontSize={13.5} color={C.muted}>
                        Đang tải danh sách sản phẩm...
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
              )}

              {!loading &&
                paginatedProducts.map((product) => {
                  const isActive = product.status === 'ACTIVE';
                  const isOnline = isOnlineProduct(product);
                  const alert = stockAlert(product);
                  const totalStock = Number(product.totalStock ?? 0);
                  const sellable = Number(product.sellableStock ?? totalStock);
                  const onlineCount = Number(product.onlineVariantCount ?? 0);
                  const activeVariants = Number(product.activeVariantCount ?? product.variantCount ?? 0);
                  // Mã các biến thể đang hoạt động (TH + mã biến thể)
                  const codes = (product.variantCodes || '').split(',').filter(Boolean);

                  return (
                    <TableRow
                      key={product.productId}
                      hover={!busy}
                      onClick={() => {
                        if (!busy) viewProduct(product.productId);
                      }}
                      sx={{
                        cursor: busy ? 'default' : 'pointer',
                        bgcolor: C.surface,
                        '&:hover': { bgcolor: '#FAFCFE' }
                      }}
                    >
                      {/* PRODUCT NAME */}
                      <TableCell sx={{ pl: 3, py: 2 }}>
                        <Stack direction="row" spacing={1.75} alignItems="center">
                          <Avatar
                            src={product.primaryImageUrl || undefined}
                            variant="rounded"
                            sx={{
                              width: 44,
                              height: 44,
                              borderRadius: 2,
                              bgcolor: '#F0FCFE',
                              color: '#0F172A',
                              fontWeight: 800,
                              border: `1px solid ${C.border}`,
                              flexShrink: 0
                            }}
                          >
                            {product.productName?.charAt(0)?.toUpperCase() || 'P'}
                          </Avatar>

                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A' }} noWrap>
                              {product.productName}
                            </Typography>
                            {/* Dòng phụ: danh mục · mã biến thể đầu (+N) · số biến thể */}
                            <Typography sx={{ fontSize: 12, color: '#94A3B8', mt: 0.25 }} noWrap>
                              {[
                                product.categoryName,
                                codes.length ? `${codes[0]}${codes.length > 1 ? ` +${codes.length - 1}` : ''}` : null,
                                `${activeVariants} biến thể`
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* SELLING PRICE */}
                      <TableCell>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A' }}>{displayPrice(product)}</Typography>
                      </TableCell>

                      {/* STOCK — tồn của biến thể đang hoạt động; có thể bán = tồn − đang giữ cho đơn */}
                      <TableCell>
                        {/* Đỏ = hết, vàng đậm = sắp hết, "Chưa nhập" xám = chưa nhập hàng lần nào; xem riêng ở tab "Cần nhập hàng" */}
                        <Tooltip
                          title={[
                            alert?.label,
                            sellable !== totalStock
                              ? `Tồn ${totalStock}, đang giữ cho đơn ${totalStock - sellable}, có thể bán ${sellable}`
                              : 'Tổng tồn của các biến thể đang hoạt động'
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        >
                          <Typography
                            component="span"
                            sx={
                              alert?.level === 'NEW'
                                ? { fontSize: 13, fontWeight: 600, color: C.subtle }
                                : {
                                    fontSize: 13.5,
                                    fontWeight: 700,
                                    color: alert?.level === 'OUT' ? '#DC2626' : alert?.level === 'LOW' ? '#B45309' : C.text
                                  }
                            }
                          >
                            {alert?.level === 'NEW' ? 'Chưa nhập' : totalStock}
                            {sellable !== totalStock && (
                              <Box component="span" sx={{ fontSize: 12, fontWeight: 600, color: C.muted, ml: 0.75 }}>
                                (bán được {sellable})
                              </Box>
                            )}
                          </Typography>
                        </Tooltip>
                      </TableCell>

                      {/* TRẠNG THÁI: đang bán / đã ẩn + online (đổi ở menu ⋯) */}
                      <TableCell>
                        <Stack direction="row" spacing={0.75} alignItems="center" flexWrap="wrap" useFlexGap>
                          <Box sx={chipSx(isActive ? '#E7F6F1' : '#F0F2F4', isActive ? '#168B70' : '#75869F')}>
                            {isActive ? 'Đang bán' : 'Đã ẩn'}
                          </Box>
                          {isOnline && (
                            <Tooltip title={`${onlineCount}/${activeVariants} biến thể đang bán online`}>
                              <Box sx={chipSx('#F0FCFE', C.cyanText)}>
                                Online{onlineCount < activeVariants ? ` ${onlineCount}/${activeVariants}` : ''}
                              </Box>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>

                      {/* ACTIONS */}
                      <TableCell align="right" sx={{ pr: 3 }}>
                        <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={0.5}>
                          <Tooltip title="Chỉnh sửa">
                            <IconButton
                              size="small"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                navigate(`/products/${product.productId}/edit`);
                              }}
                              sx={{
                                color: '#64748B',
                                p: 0.75,
                                '&:hover': {
                                  color: '#0F172A',
                                  bgcolor: 'transparent'
                                }
                              }}
                            >
                              <EditOutlined style={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>

                          <Tooltip title="Tùy chọn khác">
                            <IconButton
                              size="small"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                setMenuAnchor(event.currentTarget);
                                setMenuProduct(product);
                              }}
                              sx={{ color: '#64748B', p: 0.75, '&:hover': { color: '#0F172A', bgcolor: 'transparent' } }}
                            >
                              <EllipsisOutlined style={{ fontSize: 17 }} />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}

              {!loading && filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>
                      {products.length === 0 ? 'Chưa có sản phẩm nào trong kho' : 'Không tìm thấy sản phẩm phù hợp'}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>
                      {products.length === 0
                        ? 'Hãy thêm sản phẩm mới hoặc nhập tệp danh sách từ file Excel.'
                        : 'Hãy thử từ khóa khác, danh mục khác hoặc chọn tab khác.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Phân trang phía dưới (component chung của nhóm) */}
        <Pager
          page={currentPage - 1}
          totalPages={pageCount}
          total={filteredProducts.length}
          size={PAGE_SIZE}
          noun="sản phẩm"
          onPage={(p) => !busy && setPage(p + 1)}
          sx={{ borderTop: `1px solid ${C.borderLight}` }}
        />
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mt: 2.5 }}>
        <Typography sx={{ fontSize: 12.5, color: C.muted }}>
          Tồn kho và giá chỉ tính biến thể đang hoạt động. "Hết / sắp hết" dùng ngưỡng tối thiểu đặt ở màn hình Tồn kho.
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: C.muted }}>
          {loadedAt ? `Dữ liệu tải lúc ${loadedAt.toLocaleTimeString('vi-VN')}` : ''}
        </Typography>
      </Box>

      {/* MENU ⋯: xem, ẩn/hiện, bật/tắt bán online (mở hộp thoại xác nhận như trước) */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { borderRadius: 2.5, minWidth: 220, mt: 0.5 } } }}
      >
        {menuProduct && [
          <MenuItem
            key="view"
            onClick={() => {
              setMenuAnchor(null);
              viewProduct(menuProduct.productId);
            }}
            sx={{ fontSize: 13.5, fontWeight: 600 }}
          >
            <ListItemIcon>
              <EyeOutlined />
            </ListItemIcon>
            Xem chi tiết
          </MenuItem>,
          <MenuItem
            key="online"
            disabled={menuProduct.status !== 'ACTIVE'}
            onClick={() => {
              setMenuAnchor(null);
              openOnlineDialog(menuProduct);
            }}
            sx={{ fontSize: 13.5, fontWeight: 600 }}
          >
            <ListItemIcon>
              <GlobalOutlined />
            </ListItemIcon>
            {isOnlineProduct(menuProduct) ? 'Tắt bán online' : 'Bật bán online'}
          </MenuItem>,
          <MenuItem
            key="status"
            onClick={() => {
              setMenuAnchor(null);
              openStatusDialog(menuProduct);
            }}
            sx={{ fontSize: 13.5, fontWeight: 600, color: menuProduct.status === 'ACTIVE' ? '#B45309' : '#168B70' }}
          >
            <ListItemIcon sx={{ color: 'inherit' }}>
              {menuProduct.status === 'ACTIVE' ? <EyeInvisibleOutlined /> : <EyeOutlined />}
            </ListItemIcon>
            {menuProduct.status === 'ACTIVE' ? 'Ẩn sản phẩm' : 'Hiện lại sản phẩm'}
          </MenuItem>
        ]}
      </Menu>

      {/* CHANGE PRODUCT STATUS DIALOG */}
      <Dialog
        open={Boolean(statusDialogProduct)}
        onClose={closeStatusDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0F172A', fontSize: 18 }}>
          {statusDialogProduct?.status === 'ACTIVE' ? 'Ẩn sản phẩm' : 'Kích hoạt sản phẩm'}
        </DialogTitle>

        <DialogContent>
          <DialogContentText sx={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>
            Bạn có chắc chắn muốn {statusDialogProduct?.status === 'ACTIVE' ? 'ẩn' : 'kích hoạt lại'}{' '}
            <strong>{statusDialogProduct?.productName}</strong>?
          </DialogContentText>

          {statusDialogProduct?.status === 'ACTIVE' && (
            <Box sx={{ bgcolor: C.cream, borderRadius: 2.5, p: 2, mt: 2 }}>
              <Typography sx={{ fontSize: 12.5, color: C.creamText, lineHeight: 1.6 }}>
                Sản phẩm này sẽ không còn hiển thị để khách hàng mua online. Dữ liệu kho và thông tin sản phẩm vẫn được bảo lưu an toàn.
              </Typography>
            </Box>
          )}

          {statusDialogProduct?.status === 'INACTIVE' && (
            <Box sx={{ bgcolor: '#F0FCFE', border: `1px solid ${C.cyan}`, borderRadius: 2.5, p: 2, mt: 2 }}>
              <Typography sx={{ fontSize: 12.5, color: C.cyanText, lineHeight: 1.6 }}>
                Sản phẩm sẽ hoạt động trở lại trong hệ thống quản lý. Trạng thái bán online vẫn phụ thuộc vào cấu hình biến thể của sản
                phẩm.
              </Typography>
            </Box>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={closeStatusDialog} disabled={statusSaving} sx={outlineButtonSx}>
            Hủy
          </Button>

          <Button
            disabled={statusSaving}
            onClick={confirmChangeProductStatus}
            sx={{
              ...outlineButtonSx,
              border: 'none',
              bgcolor: statusDialogProduct?.status === 'ACTIVE' ? C.cream : C.cyan,
              color: statusDialogProduct?.status === 'ACTIVE' ? C.creamText : '#0F172A',
              fontWeight: 800,
              '&:hover': {
                bgcolor: statusDialogProduct?.status === 'ACTIVE' ? C.creamHover : C.cyanHover
              }
            }}
          >
            {statusSaving ? 'Đang lưu...' : statusDialogProduct?.status === 'ACTIVE' ? 'Ẩn sản phẩm' : 'Kích hoạt'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ONLINE SALE DIALOG */}
      <Dialog
        open={Boolean(onlineTarget)}
        onClose={closeOnlineDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#0F172A', fontSize: 18 }}>
          {enablingOnline ? 'Bật bán online' : 'Tắt bán online'}
        </DialogTitle>

        <DialogContent>
          <DialogContentText sx={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>
            {enablingOnline ? 'Mở bán' : 'Ngừng bán'} <strong>{onlineTarget?.productName}</strong> trên website?
          </DialogContentText>

          <Box
            sx={{
              bgcolor: enablingOnline ? '#F0FCFE' : C.cream,
              border: enablingOnline ? `1px solid ${C.cyan}` : 'none',
              borderRadius: 2.5,
              p: 2,
              mt: 2
            }}
          >
            <Typography sx={{ fontSize: 12.5, color: enablingOnline ? C.cyanText : C.creamText, lineHeight: 1.6 }}>
              {enablingOnline
                ? 'Mọi biến thể đang hoạt động và đã có giá sẽ hiển thị trên cửa hàng online. Muốn bật/tắt từng size, màu hãy vào trang chi tiết sản phẩm.'
                : 'Mọi biến thể sẽ bị ẩn khỏi cửa hàng online; khách không thể thêm vào giỏ hay đặt mới. Bán tại quầy và Facebook không bị ảnh hưởng.'}
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={closeOnlineDialog} disabled={onlineSaving} sx={outlineButtonSx}>
            Hủy
          </Button>

          <Button
            disabled={onlineSaving}
            onClick={confirmToggleOnline}
            sx={{
              ...outlineButtonSx,
              border: 'none',
              bgcolor: enablingOnline ? C.cyan : C.cream,
              color: enablingOnline ? '#0F172A' : C.creamText,
              fontWeight: 800,
              '&:hover': { bgcolor: enablingOnline ? C.cyanHover : C.creamHover }
            }}
          >
            {onlineSaving ? 'Đang lưu...' : enablingOnline ? 'Bật bán online' : 'Tắt bán online'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* EXCEL BATCH IMPORT DIALOG */}
      <ProductExcelDialog
        open={excelDialogOpen}
        onClose={() => setExcelDialogOpen(false)}
        categories={categories}
        onSuccess={(msg) => {
          setSuccess(msg);
          loadProducts();
        }}
      />
    </Box>
  );
}

import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react';

import { useNavigate } from 'react-router-dom';

import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Pagination,
  Select,
  Stack,
  Switch,
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

import {
  CameraOutlined,
  CheckOutlined,
  CloseOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeOutlined,
  FileExcelOutlined,
  PictureOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined
} from '@ant-design/icons';

import {
  getProducts,
  getProductById,
  updateProduct,
  changeProductStatus,
  deleteProduct
} from '../../services/productService';

import { getCategories } from '../../services/categoryService';
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
const LOW_STOCK_THRESHOLD = 5;

const inputSx = (hasError) => ({
  '& .MuiOutlinedInput-root': {
    borderRadius: 2.5,
    minHeight: 44,
    fontSize: 13.5,
    '& fieldset': { borderColor: hasError ? C.error : C.border },
    '&:hover fieldset, &.Mui-focused fieldset': { borderColor: hasError ? C.error : C.cyan }
  }
});

const linkButtonSx = (color, hoverBg) => ({
  textTransform: 'none',
  fontSize: 13,
  fontWeight: 600,
  color,
  borderRadius: 1.5,
  px: 1.25,
  py: 0.5,
  '&:hover': { bgcolor: hoverBg }
});

const badgeSx = (bg, color, border) => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.6,
  bgcolor: bg,
  color: color,
  border: `1px solid ${border}`,
  borderRadius: 99,
  px: 1.4,
  py: 0.35,
  fontSize: 12,
  fontWeight: 700,
  flexShrink: 0
});

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

  if (
    maxPrice == null ||
    Number(minPrice) === Number(maxPrice)
  ) {
    return formatPrice(minPrice);
  }

  return `${formatPrice(minPrice)} - ${formatPrice(maxPrice)}`;
}

function isOnlineProduct(product) {
  return (
    product.status === 'ACTIVE' &&
    Number(product.onlineVariantCount || 0) > 0
  );
}

function isLowStockProduct(product) {
  return (
    product.status === 'ACTIVE' &&
    Number(product.totalStock || 0) < LOW_STOCK_THRESHOLD
  );
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

  // ==========================================
  // STATES - SEARCH AND FILTER
  // ==========================================

  const [activeTab, setActiveTab] = useState('ACTIVE');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // ==========================================
  // STATES - PAGINATION
  // ==========================================

  const [page, setPage] = useState(1);

  // ==========================================
  // STATES - INLINE EDIT
  // ==========================================

  const [editingProductId, setEditingProductId] = useState(null);

  const [editForm, setEditForm] = useState({
    productName: '',
    categoryId: ''
  });

  const [saving, setSaving] = useState(false);

  // ==========================================
  // STATES - CHANGE PRODUCT STATUS
  // ==========================================

  const [statusDialogProduct, setStatusDialogProduct] = useState(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [excelDialogOpen, setExcelDialogOpen] = useState(false);

  // ==========================================
  // STATES - DELETE PRODUCT
  // ==========================================

  const [deleteDialogProduct, setDeleteDialogProduct] = useState(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const busy = editingProductId !== null || saving || statusSaving || deleteSaving;

  // ==========================================
  // LOAD PRODUCTS
  // ==========================================

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const data = await getProducts();

      if (!Array.isArray(data)) {
        throw new Error('Dữ liệu sản phẩm trả về không hợp lệ.');
      }

      setProducts(data);
    } catch (err) {
      console.error('Không thể tải sản phẩm:', err);
      setError(err?.message || 'Không thể tải danh sách sản phẩm. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ==========================================
  // LOAD CATEGORIES
  // ==========================================

  const loadCategories = useCallback(async () => {
    try {
      const response = await getCategories();
      setCategories(normalizeCategories(response));
    } catch (err) {
      console.error('Không thể tải danh mục:', err);
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

  const activeProducts = useMemo(
    () => products.filter((product) => product.status === 'ACTIVE'),
    [products]
  );

  const inactiveProducts = useMemo(
    () => products.filter((product) => product.status === 'INACTIVE'),
    [products]
  );

  const onlineProducts = useMemo(
    () => products.filter(isOnlineProduct),
    [products]
  );

  const lowStockProducts = useMemo(
    () => products.filter(isLowStockProduct),
    [products]
  );

  // ==========================================
  // SEARCH AND FILTER
  // ==========================================

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        String(product.productName || '').toLowerCase().includes(keyword) ||
        String(product.productId).toLowerCase().includes(keyword);

      const matchesCategory =
        categoryFilter === 'ALL' ||
        String(product.categoryId) === categoryFilter;

      const matchesStatus =
        statusFilter === 'ALL' || product.status === statusFilter;

      let matchesTab = true;

      if (activeTab === 'ACTIVE') {
        matchesTab = product.status === 'ACTIVE';
      } else if (activeTab === 'INACTIVE') {
        matchesTab = product.status === 'INACTIVE';
      } else if (activeTab === 'ONLINE') {
        matchesTab = isOnlineProduct(product);
      } else if (activeTab === 'LOW_STOCK') {
        matchesTab = isLowStockProduct(product);
      }

      return matchesSearch && matchesCategory && matchesStatus && matchesTab;
    });
  }, [products, search, categoryFilter, statusFilter, activeTab]);

  // ==========================================
  // PAGINATION
  // ==========================================

  const pageCount = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const paginatedProducts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredProducts.slice(start, start + PAGE_SIZE);
  }, [filteredProducts, currentPage]);

  const showingFrom = filteredProducts.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0;
  const showingTo = Math.min(currentPage * PAGE_SIZE, filteredProducts.length);

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
  // INLINE EDIT - START
  // ==========================================

  function startInlineEdit(product) {
    if (busy) return;

    setError('');
    setSuccess('');
    setEditingProductId(product.productId);
    setEditForm({
      productName: product.productName || '',
      categoryId: String(product.categoryId ?? '')
    });
  }

  // ==========================================
  // INLINE EDIT - CANCEL
  // ==========================================

  function cancelInlineEdit() {
    if (saving) return;

    setEditingProductId(null);
    setEditForm({ productName: '', categoryId: '' });
    setError('');
  }

  // ==========================================
  // INLINE EDIT - SAVE
  // ==========================================

  async function saveInlineEdit(productId) {
    if (saving || statusSaving) return;

    setError('');
    setSuccess('');

    const productName = editForm.productName.trim();
    const categoryId = Number(editForm.categoryId);

    if (!productName) {
      setError('Vui lòng nhập tên sản phẩm.');
      return;
    }

    if (productName.length > 200) {
      setError('Tên sản phẩm không được vượt quá 200 ký tự.');
      return;
    }

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      setError('Vui lòng chọn danh mục hợp lệ.');
      return;
    }

    const selectedCategory = categories.find(
      (category) => Number(category.categoryId) === categoryId
    );

    if (!selectedCategory) {
      setError('Danh mục đã chọn không tồn tại.');
      return;
    }

    if (selectedCategory.status !== 'ACTIVE') {
      setError('Vui lòng chọn danh mục đang hoạt động.');
      return;
    }

    try {
      setSaving(true);

      const productDetail = await getProductById(productId);

      if (!productDetail?.product || !Array.isArray(productDetail.variants)) {
        throw new Error('Không thể tải chi tiết sản phẩm.');
      }

      const { product, variants } = productDetail;

      if (variants.length === 0) {
        throw new Error('Sản phẩm phải có ít nhất một biến thể.');
      }

      const payload = {
        categoryId,
        productName,
        description: product.description ?? '',
        variants: variants.map((variant) => ({
          detailId: Number(variant.detailId),
          size: variant.size,
          color: variant.color,
          price: Number(variant.price)
        }))
      };

      await updateProduct(productId, payload);

      const updatedProducts = await getProducts();

      if (!Array.isArray(updatedProducts)) {
        throw new Error('Đã cập nhật sản phẩm nhưng không thể làm mới danh sách.');
      }

      setProducts(updatedProducts);
      setEditingProductId(null);
      setEditForm({ productName: '', categoryId: '' });
      setSuccess('Cập nhật sản phẩm thành công.');
    } catch (err) {
      console.error('Lỗi cập nhật nhanh:', err);
      setError(err?.message || 'Không thể cập nhật sản phẩm. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
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

      setProducts((previous) =>
        previous.map((product) =>
          product.productId === productId
            ? { ...product, status: newStatus }
            : product
        )
      );

      setStatusDialogProduct(null);
      setSuccess(
        newStatus === 'ACTIVE'
          ? 'Đã kích hoạt sản phẩm thành công.'
          : 'Đã ẩn sản phẩm thành công.'
      );

      try {
        const updatedProducts = await getProducts();
        if (Array.isArray(updatedProducts)) {
          setProducts(updatedProducts);
        }
      } catch (refreshError) {
        console.error('Lỗi làm mới danh sách sản phẩm:', refreshError);
      }
    } catch (err) {
      console.error('Lỗi đổi trạng thái sản phẩm:', err);
      setError(err?.message || 'Không thể đổi trạng thái sản phẩm. Vui lòng thử lại.');
    } finally {
      setStatusSaving(false);
    }
  }

  // ==========================================
  // DELETE PRODUCT (SAFE DELETE)
  // ==========================================

  function openDeleteDialog(product) {
    if (busy || !product) return;

    setError('');
    setSuccess('');
    setDeleteDialogProduct(product);
  }

  function closeDeleteDialog() {
    if (deleteSaving) return;
    setDeleteDialogProduct(null);
  }

  async function confirmDeleteProduct() {
    if (!deleteDialogProduct || deleteSaving) return;

    const productId = deleteDialogProduct.productId;
    const productName = deleteDialogProduct.productName;

    try {
      setDeleteSaving(true);
      setError('');
      setSuccess('');

      await deleteProduct(productId);

      setProducts((previous) =>
        previous.filter((product) => product.productId !== productId)
      );

      setDeleteDialogProduct(null);
      setSuccess(`Đã xóa vĩnh viễn sản phẩm "${productName}" (Mã: #${productId}).`);

      try {
        const updatedProducts = await getProducts();
        if (Array.isArray(updatedProducts)) {
          setProducts(updatedProducts);
        }
      } catch (refreshError) {
        console.error('Lỗi làm mới sau khi xóa:', refreshError);
      }
    } catch (err) {
      console.error('Lỗi xóa sản phẩm:', err);
      setError(
        err?.message ||
        'Không thể xóa sản phẩm. Sản phẩm có thể đã có lịch sử giao dịch trong hệ thống.'
      );
      setDeleteDialogProduct(null);
    } finally {
      setDeleteSaving(false);
    }
  }

  // ==========================================
  // RENDER
  // ==========================================

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
            Quản lý kho hàng, định giá bán và trạng thái mở bán online cho các sản phẩm
          </Typography>
        </Box>

        <Stack direction="row" spacing={1.5} alignItems="center">
          <Button
            startIcon={<FileExcelOutlined />}
            disabled={busy}
            onClick={() => setExcelDialogOpen(true)}
            sx={{
              ...outlineButtonSx,
              color: '#0D9488',
              borderColor: '#99F6E4',
              bgcolor: '#F0FDFA',
              fontWeight: 700,
              '&:hover': {
                bgcolor: '#CCFBF1',
                borderColor: '#5EEAD4'
              }
            }}
          >
            Nhập từ Excel
          </Button>

          <Button
            startIcon={<PlusOutlined />}
            disabled={busy}
            onClick={() => navigate('/products/add')}
            sx={primaryButtonSx}
          >
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

      {/* SUCCESS MESSAGE */}
      {success && (
        <Alert severity="success" sx={{ mb: 2.5, borderRadius: 2.5, fontSize: 13.5, fontWeight: 600 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* QUICK FILTER TABS */}
      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 3 }}
      >
        {[
          { key: 'ACTIVE', label: 'Đang hoạt động', count: activeProducts.length },
          { key: 'INACTIVE', label: 'Đã ẩn', count: inactiveProducts.length },
          { key: 'ONLINE', label: 'Bán online', count: onlineProducts.length },
          { key: 'LOW_STOCK', label: 'Sắp hết hàng', count: lowStockProducts.length },
          { key: 'ALL', label: 'Tất cả sản phẩm', count: products.length }
        ].map((tab) => {
          const selected = activeTab === tab.key;

          return (
            <Button
              key={tab.key}
              disabled={busy}
              onClick={() => changeTab(tab.key)}
              sx={{
                textTransform: 'none',
                height: 40,
                px: 2.25,
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
              {tab.label} ({loading ? '—' : tab.count})
            </Button>
          );
        })}
      </Stack>

      {/* AI IMAGE SEARCH BANNER (PHUOC'S TEAL BOX) */}
      <Box
        sx={{
          bgcolor: '#F0FDFA',
          borderRadius: 3.5,
          border: '1px solid #99F6E4',
          p: { xs: 2.5, sm: 3 },
          mb: 3
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            <Box
              sx={{
                width: 48,
                height: 48,
                bgcolor: C.surface,
                borderRadius: 2.5,
                border: '1px solid #99F6E4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0F766E',
                fontSize: 22
              }}
            >
              <PictureOutlined />
            </Box>

            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: '#0F766E' }}>
                Tìm kiếm bằng hình ảnh (AI Visual Search)
              </Typography>
              <Typography sx={{ fontSize: 13, color: '#115E59', mt: 0.25 }}>
                Tìm nhanh sản phẩm trong kho bằng hình ảnh chụp hoặc ảnh tải lên từ thiết bị của bạn.
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1.5}>
            <Tooltip title="Tính năng AI đang hoàn thiện tích hợp">
              <span>
                <Button
                  disabled
                  startIcon={<UploadOutlined />}
                  sx={{ ...outlineButtonSx, height: 40, fontSize: 13 }}
                >
                  Tải ảnh lên
                </Button>
              </span>
            </Tooltip>

            <Tooltip title="Tính năng Camera đang hoàn thiện tích hợp">
              <span>
                <Button
                  disabled
                  startIcon={<CameraOutlined />}
                  sx={{ ...outlineButtonSx, height: 40, fontSize: 13 }}
                >
                  Mở camera
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* SEARCH AND FILTER */}
      <Box
        sx={{
          mb: 3,
          display: 'grid',
          gridTemplateColumns: {
            xs: '1fr',
            sm: 'repeat(2, 1fr)',
            md: 'minmax(200px, 1.8fr) 180px 180px auto'
          },
          gap: { xs: 1.5, lg: 2 },
          alignItems: 'flex-end'
        }}
      >
        {/* SEARCH */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Tìm kiếm sản phẩm
          </Typography>
          <TextField
            fullWidth
            size="small"
            disabled={busy}
            placeholder="Tìm theo tên sản phẩm hoặc mã ID..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              resetPage();
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined style={{ color: '#94A3B8', fontSize: 16 }} />
                </InputAdornment>
              )
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: C.surface,
                borderRadius: 2.5,
                height: 44,
                fontSize: 13.5,
                '& fieldset': { borderColor: C.border },
                '&:hover fieldset': { borderColor: C.cyan },
                '&.Mui-focused fieldset': { borderColor: C.cyan }
              }
            }}
          />
        </Box>

        {/* CATEGORY FILTER */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Danh mục
          </Typography>
          <Select
            fullWidth
            size="small"
            disabled={busy}
            value={categoryFilter}
            onChange={(event) => {
              setCategoryFilter(event.target.value);
              resetPage();
            }}
            sx={{
              bgcolor: C.surface,
              borderRadius: 2.5,
              height: 44,
              fontSize: 13.5,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan }
            }}
          >
            <MenuItem value="ALL">Tất cả danh mục</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.categoryId} value={String(category.categoryId)}>
                {category.categoryName}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {/* STATUS FILTER */}
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600, color: C.text, mb: 0.75 }}>
            Trạng thái
          </Typography>
          <Select
            fullWidth
            size="small"
            disabled={busy}
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
              resetPage();
            }}
            sx={{
              bgcolor: C.surface,
              borderRadius: 2.5,
              height: 44,
              fontSize: 13.5,
              '& .MuiOutlinedInput-notchedOutline': { borderColor: C.border },
              '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan },
              '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: C.cyan }
            }}
          >
            <MenuItem value="ALL">Tất cả trạng thái</MenuItem>
            <MenuItem value="ACTIVE">Đang hoạt động</MenuItem>
            <MenuItem value="INACTIVE">Đã ẩn</MenuItem>
          </Select>
        </Box>

        {/* Nút Bỏ lọc */}
        <Box sx={{ minWidth: 0, display: 'flex' }}>
          <Button
            variant="outlined"
            onClick={() => {
              setSearch('');
              setCategoryFilter('ALL');
              setStatusFilter('ALL');
              setActiveTab('ALL');
              resetPage();
            }}
            disableRipple
            sx={{
              height: 44,
              px: 2,
              minWidth: 'unset',
              borderRadius: 2.5,
              textTransform: 'none',
              fontSize: 13,
              fontWeight: 600,
              borderColor: C.border,
              bgcolor: C.surface,
              color: C.text,
              whiteSpace: 'nowrap',
              '&:hover': {
                bgcolor: '#F8FAFC',
                borderColor: C.border,
                color: C.text
              }
            }}
          >
            Bỏ lọc
          </Button>
        </Box>
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
              minWidth: 950,
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
                <TableCell>DANH MỤC</TableCell>
                <TableCell>GIÁ BÁN</TableCell>
                <TableCell>TỒN KHO</TableCell>
                <TableCell>TRẠNG THÁI</TableCell>
                <TableCell>BÁN ONLINE</TableCell>
                <TableCell align="center" sx={{ pr: 3 }}>THAO TÁC</TableCell>
              </TableRow>
            </TableHead>

            {/* TABLE BODY */}
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
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
                  const lowStock = isLowStockProduct(product);
                  const isEditing = editingProductId === product.productId;

                  return (
                    <TableRow
                      key={product.productId}
                      hover={!busy}
                      onClick={() => {
                        if (!busy) viewProduct(product.productId);
                      }}
                      sx={{
                        cursor: busy ? 'default' : 'pointer',
                        bgcolor: isEditing ? '#F0FCFE' : C.surface,
                        '&:hover': { bgcolor: isEditing ? '#F0FCFE' : '#FAFCFE' }
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
                            {isEditing ? (
                              <TextField
                                autoFocus
                                size="small"
                                value={editForm.productName}
                                disabled={saving}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) =>
                                  setEditForm((previous) => ({
                                    ...previous,
                                    productName: event.target.value
                                  }))
                                }
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                  if (event.key === 'Enter') {
                                    event.preventDefault();
                                    saveInlineEdit(product.productId);
                                  }
                                  if (event.key === 'Escape') {
                                    cancelInlineEdit();
                                  }
                                }}
                                slotProps={{ htmlInput: { maxLength: 200 } }}
                                sx={{ minWidth: 200, bgcolor: C.surface, ...inputSx(false) }}
                              />
                            ) : (
                              <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A' }} noWrap>
                                {product.productName}
                              </Typography>
                            )}
                            <Typography sx={{ fontSize: 12, color: '#94A3B8', mt: 0.25 }}>
                              Mã ID: #{product.productId}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* CATEGORY */}
                      <TableCell>
                        {isEditing ? (
                          <Select
                            size="small"
                            fullWidth
                            disabled={saving}
                            value={editForm.categoryId}
                            onClick={(event) => event.stopPropagation()}
                            onChange={(event) =>
                              setEditForm((previous) => ({
                                ...previous,
                                categoryId: event.target.value
                              }))
                            }
                            sx={{
                              minWidth: 150,
                              bgcolor: C.surface,
                              fontSize: 13,
                              borderRadius: 2
                            }}
                          >
                            {categories.map((category) => {
                              const isCurrent = String(category.categoryId) === editForm.categoryId;
                              return (
                                <MenuItem
                                  key={category.categoryId}
                                  value={String(category.categoryId)}
                                  disabled={category.status !== 'ACTIVE' && !isCurrent}
                                >
                                  {category.categoryName}
                                  {category.status !== 'ACTIVE' ? ' (Đã ngưng)' : ''}
                                </MenuItem>
                              );
                            })}
                          </Select>
                        ) : (
                          <Typography sx={{ fontSize: 13.5, color: '#334155', fontWeight: 500 }}>
                            {product.categoryName || '—'}
                          </Typography>
                        )}
                      </TableCell>

                      {/* SELLING PRICE */}
                      <TableCell>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 800, color: '#0F172A' }}>
                          {displayPrice(product)}
                        </Typography>
                      </TableCell>

                      {/* STOCK */}
                      <TableCell>
                        <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
                          {product.totalStock ?? 0}
                        </Typography>
                        {lowStock && (
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              px: 1.25,
                              py: 0.3,
                              borderRadius: 4,
                              bgcolor: C.cream,
                              color: C.creamText,
                              fontSize: 11,
                              fontWeight: 700,
                              letterSpacing: '0.01em',
                              mt: 0.5
                            }}
                          >
                            Sắp hết
                          </Box>
                        )}
                      </TableCell>

                      {/* PRODUCT STATUS */}
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ pt: 0.5 }}>
                          <Tooltip title={isActive ? 'Nhấn để ẩn sản phẩm' : 'Nhấn để kích hoạt sản phẩm'}>
                            <span>
                              <Switch
                                checked={isActive}
                                size="small"
                                disabled={busy}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  openStatusDialog(product);
                                }}
                                sx={{
                                  width: 34,
                                  height: 18,
                                  p: 0,
                                  '& .MuiSwitch-switchBase': {
                                    p: '2px',
                                    transitionDuration: '200ms',
                                    '&.Mui-checked': {
                                      transform: 'translateX(16px)',
                                      color: '#67E8F9',
                                      '& + .MuiSwitch-track': {
                                        bgcolor: '#BAF2F8',
                                        opacity: 1,
                                        border: 0
                                      }
                                    }
                                  },
                                  '& .MuiSwitch-thumb': {
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                    width: 14,
                                    height: 14
                                  },
                                  '& .MuiSwitch-track': {
                                    borderRadius: 9,
                                    bgcolor: '#CBD5E1',
                                    opacity: 1
                                  }
                                }}
                              />
                            </span>
                          </Tooltip>

                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              px: 1.5,
                              py: 0.35,
                              borderRadius: 1.75,
                              fontSize: 13,
                              fontWeight: 600,
                              bgcolor: isActive ? '#E7F6F1' : '#F0F2F4',
                              color: isActive ? '#168B70' : '#75869F'
                            }}
                          >
                            {isActive ? 'Hoạt động' : 'Đã ẩn'}
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* ONLINE SALE */}
                      <TableCell>
                        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ pt: 0.5 }}>
                          <Tooltip title={`${product.onlineVariantCount ?? 0}/${product.variantCount ?? 0} biến thể được bật bán online`}>
                            <span>
                              <Switch
                                checked={isOnline}
                                disabled
                                size="small"
                                sx={{
                                  width: 34,
                                  height: 18,
                                  p: 0,
                                  '& .MuiSwitch-switchBase': {
                                    p: '2px',
                                    transitionDuration: '200ms',
                                    '&.Mui-checked': {
                                      transform: 'translateX(16px)',
                                      color: '#67E8F9',
                                      '& + .MuiSwitch-track': {
                                        bgcolor: '#BAF2F8',
                                        opacity: 1,
                                        border: 0
                                      }
                                    }
                                  },
                                  '& .MuiSwitch-thumb': {
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                                    width: 14,
                                    height: 14
                                  },
                                  '& .MuiSwitch-track': {
                                    borderRadius: 9,
                                    bgcolor: '#CBD5E1',
                                    opacity: 1
                                  }
                                }}
                              />
                            </span>
                          </Tooltip>
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              px: 1.5,
                              py: 0.35,
                              borderRadius: 1.75,
                              fontSize: 13,
                              fontWeight: 600,
                              bgcolor: isOnline ? '#E7F6F1' : '#F0F2F4',
                              color: isOnline ? '#168B70' : '#75869F'
                            }}
                          >
                            {isOnline ? 'Đang bật' : 'Đang tắt'}
                          </Box>
                        </Stack>
                      </TableCell>

                      {/* ACTIONS */}
                      <TableCell align="center" sx={{ pr: 3 }}>
                        {isEditing ? (
                          <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                            <Tooltip title="Lưu thay đổi">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={saving}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    saveInlineEdit(product.productId);
                                  }}
                                  sx={{
                                    color: '#059669',
                                    bgcolor: '#E8F6F0',
                                    '&:hover': { bgcolor: '#D1FAE5' }
                                  }}
                                >
                                  {saving ? <CircularProgress size={16} /> : <CheckOutlined />}
                                </IconButton>
                              </span>
                            </Tooltip>

                            <Tooltip title="Hủy bỏ">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={saving}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    cancelInlineEdit();
                                  }}
                                  sx={{
                                    color: C.error,
                                    bgcolor: '#FEE2E2',
                                    '&:hover': { bgcolor: '#FECACA' }
                                  }}
                                >
                                  <CloseOutlined />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        ) : (
                          <Stack direction="row" alignItems="center" justifyContent="center" spacing={0.5}>
                            <Tooltip title="Xem chi tiết">
                              <IconButton
                                size="small"
                                disabled={busy}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  viewProduct(product.productId);
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
                                <EyeOutlined style={{ fontSize: 17 }} />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Chỉnh sửa sản phẩm">
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

                            <Tooltip title="Xóa vĩnh viễn sản phẩm">
                              <IconButton
                                size="small"
                                disabled={busy}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDeleteDialog(product);
                                }}
                                sx={{
                                  color: '#64748B',
                                  p: 0.75,
                                  '&:hover': {
                                    color: '#EF4444',
                                    bgcolor: 'transparent'
                                  }
                                }}
                              >
                                <DeleteOutlined style={{ fontSize: 17 }} />
                              </IconButton>
                            </Tooltip>
                          </Stack>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}

              {!loading && filteredProducts.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 800, color: '#0F172A' }}>
                      {products.length === 0
                        ? 'Chưa có sản phẩm nào trong kho'
                        : 'Không tìm thấy sản phẩm phù hợp'}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>
                      {products.length === 0
                        ? 'Hãy thêm sản phẩm mới hoặc nhập tệp danh sách từ file Excel.'
                        : 'Hãy thử thay đổi từ khóa tìm kiếm hoặc bỏ bớt bộ lọc.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Phân trang phía dưới */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', sm: '1fr auto 1fr' },
            alignItems: 'center',
            gap: 1.5,
            px: 3,
            py: 2,
            borderTop: `1px solid ${C.borderLight}`
          }}
        >
          <Typography sx={{ fontSize: 13, color: C.muted, textAlign: { xs: 'center', sm: 'left' } }}>
            Hiển thị {filteredProducts.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–
            {Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} / {filteredProducts.length} sản phẩm
          </Typography>
          <Pagination
            count={pageCount}
            page={currentPage}
            disabled={busy}
            onChange={(_, value) => setPage(value)}
            size="small"
            shape="rounded"
            sx={{
              justifySelf: 'center',
              '& .MuiPaginationItem-root': {
                minWidth: 26,
                height: 26,
                fontSize: 12.5,
                borderRadius: 1.5,
                transition: 'none',
                '&:hover': { bgcolor: '#F1F5F9' }
              },
              '& .MuiTouchRipple-root': { display: 'none' },
              '& .MuiPaginationItem-root.Mui-selected': {
                bgcolor: `${C.cyan} !important`,
                color: `${C.text} !important`,
                fontWeight: 700
              }
            }}
          />
        </Box>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mt: 2.5 }}>
        <Typography sx={{ fontSize: 12.5, color: C.muted }}>
          Số lượng sản phẩm online phản ánh các biến thể đã được kích hoạt bán trên hệ thống web.
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: C.muted }}>
          Dữ liệu kiểm kho được đồng bộ thời gian thực từ THORS Inventory.
        </Typography>
      </Box>

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
            <Box
              sx={{
                bgcolor: '#FFFDE7',
                border: '1.5px solid #FDE047',
                borderRadius: 2.5,
                p: 2,
                mt: 2
              }}
            >
              <Typography sx={{ fontSize: 12.5, color: '#713F12', lineHeight: 1.6 }}>
                Sản phẩm này sẽ không còn hiển thị để khách hàng mua online. Dữ liệu kho và thông tin sản phẩm vẫn được bảo lưu an toàn.
              </Typography>
            </Box>
          )}

          {statusDialogProduct?.status === 'INACTIVE' && (
            <Box
              sx={{
                bgcolor: '#F0FDFA',
                border: '1px solid #99F6E4',
                borderRadius: 2.5,
                p: 2,
                mt: 2
              }}
            >
              <Typography sx={{ fontSize: 12.5, color: '#115E59', lineHeight: 1.6 }}>
                Sản phẩm sẽ hoạt động trở lại trong hệ thống quản lý. Trạng thái bán online vẫn phụ thuộc vào cấu hình biến thể của sản phẩm.
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
              bgcolor: statusDialogProduct?.status === 'ACTIVE' ? '#FEF3C7' : C.cyan,
              color: statusDialogProduct?.status === 'ACTIVE' ? '#92400E' : '#0F172A',
              fontWeight: 800,
              '&:hover': {
                bgcolor: statusDialogProduct?.status === 'ACTIVE' ? '#FDE68A' : C.cyanHover
              }
            }}
          >
            {statusSaving ? 'Đang lưu...' : statusDialogProduct?.status === 'ACTIVE' ? 'Ẩn sản phẩm' : 'Kích hoạt'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* DELETE PRODUCT DIALOG */}
      <Dialog
        open={Boolean(deleteDialogProduct)}
        onClose={closeDeleteDialog}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, color: '#DC2626', fontSize: 18 }}>
          Xác nhận xóa vĩnh viễn sản phẩm
        </DialogTitle>

        <DialogContent>
          <DialogContentText sx={{ fontSize: 14, color: C.text, lineHeight: 1.6 }}>
            Bạn có chắc chắn muốn xóa sản phẩm{' '}
            <strong>{deleteDialogProduct?.productName}</strong> (Mã ID: #{deleteDialogProduct?.productId})?
          </DialogContentText>

          <Box
            sx={{
              bgcolor: '#FFFDE7',
              border: '1.5px solid #FDE047',
              borderRadius: 2.5,
              p: 2,
              mt: 2
            }}
          >
            <Typography sx={{ fontSize: 12.5, color: '#713F12', lineHeight: 1.6 }}>
              Hành động này sẽ xóa hoàn toàn sản phẩm, các biến thể và hình ảnh liên quan khỏi hệ thống nếu sản phẩm chưa phát sinh lịch sử giao dịch. Nếu sản phẩm đã từng có đơn hàng hoặc phiếu kho, hệ thống sẽ ngăn chặn việc xóa để đảm bảo toàn vẹn dữ liệu.
            </Typography>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={closeDeleteDialog} disabled={deleteSaving} sx={outlineButtonSx}>
            Hủy
          </Button>

          <Button
            disabled={deleteSaving}
            onClick={confirmDeleteProduct}
            sx={{
              ...outlineButtonSx,
              border: 'none',
              bgcolor: '#FEE2E2',
              color: '#DC2626',
              fontWeight: 800,
              '&:hover': {
                bgcolor: '#FCA5A5'
              }
            }}
          >
            {deleteSaving ? 'Đang xóa...' : 'Xác nhận xóa'}
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

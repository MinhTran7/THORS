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
  Chip,
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
  EditOutlined,
  EyeOutlined,
  PictureOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined
} from '@ant-design/icons';

import {
  getProducts,
  getProductById,
  updateProduct,
  changeProductStatus
} from '../../services/productService';

import { getCategories } from '../../services/categoryService';

// ==========================================
// CONFIGURATION
// ==========================================

const COLORS = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  cyan: '#8DE9F2',
  cyanLight: '#EAFBFD',
  green: '#25856A',
  red: '#D04D4D'
};

const PAGE_SIZE = 6;
const LOW_STOCK_THRESHOLD = 5;

const cardSx = {
  border: `1px solid ${COLORS.border}`,
  borderRadius: 2,
  boxShadow: 'none',
  bgcolor: '#FFFFFF'
};

// ==========================================
// HELPERS
// ==========================================

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

// ==========================================
// PRODUCT PAGE
// ==========================================

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

  const [activeTab, setActiveTab] = useState('ALL');
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

  const busy = editingProductId !== null || saving || statusSaving;

  // ==========================================
  // LOAD PRODUCTS
  // ==========================================

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const data = await getProducts();

      if (!Array.isArray(data)) {
        throw new Error('Invalid product data returned by server.');
      }

      setProducts(data);
    } catch (err) {
      console.error('Failed to load products:', err);

      setError(
        err?.message ||
        'Unable to load products. Please try again.'
      );
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
      console.error('Failed to load categories:', err);
      setError(err?.message || 'Unable to load categories.');
    }
  }, []);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, [loadProducts, loadCategories]);

  // ==========================================
  // STATISTICS
  // ==========================================

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

      if (activeTab === 'ONLINE') {
        matchesTab = isOnlineProduct(product);
      }

      if (activeTab === 'LOW_STOCK') {
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
      setError('Product name is required.');
      return;
    }

    if (productName.length > 200) {
      setError('Product name must not exceed 200 characters.');
      return;
    }

    if (!Number.isInteger(categoryId) || categoryId <= 0) {
      setError('Please select a category.');
      return;
    }

    const selectedCategory = categories.find(
      (category) => Number(category.categoryId) === categoryId
    );

    if (!selectedCategory) {
      setError('Selected category does not exist.');
      return;
    }

    if (selectedCategory.status !== 'ACTIVE') {
      setError('Please select an active category.');
      return;
    }

    try {
      setSaving(true);

      const productDetail = await getProductById(productId);

      if (!productDetail?.product || !Array.isArray(productDetail.variants)) {
        throw new Error('Unable to retrieve product details.');
      }

      const { product, variants } = productDetail;

      if (variants.length === 0) {
        throw new Error('Product must have at least one variant.');
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
        throw new Error('Product saved, but unable to refresh the list.');
      }

      setProducts(updatedProducts);
      setEditingProductId(null);
      setEditForm({ productName: '', categoryId: '' });
      setSuccess('Product updated successfully.');
    } catch (err) {
      console.error('Inline update failed:', err);
      setError(err?.message || 'Unable to update product. Please try again.');
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
          ? 'Product activated successfully.'
          : 'Product deactivated successfully.'
      );

      try {
        const updatedProducts = await getProducts();
        if (Array.isArray(updatedProducts)) {
          setProducts(updatedProducts);
        }
      } catch (refreshError) {
        console.error('Product status saved but refresh failed:', refreshError);
      }
    } catch (err) {
      console.error('Change product status failed:', err);
      setError(err?.message || 'Unable to change product status. Please try again.');
    } finally {
      setStatusSaving(false);
    }
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <Box sx={{ maxWidth: 1440, mx: 'auto' }}>

      {/* ======================================
          HEADER
      ====================================== */}

      <Stack
        direction={{ xs: 'column', sm: 'row' }}
        justifyContent="space-between"
        alignItems={{ xs: 'flex-start', sm: 'center' }}
        spacing={2}
        sx={{ mb: 2.5 }}
      >
        <Box>
          <Typography
            sx={{
              fontSize: { xs: 24, md: 29 },
              fontWeight: 500,
              color: COLORS.text
            }}
          >
            Product List
          </Typography>

          <Typography
            fontSize={12}
            color={COLORS.muted}
            sx={{ mt: 0.5 }}
          >
            Your inventory, organized. Manage stock,
            pricing and online visibility.
          </Typography>
        </Box>

        <Button
          variant="contained"
          startIcon={<PlusOutlined />}
          disabled={busy}
          onClick={() => navigate('/products/add')}
          sx={{
            bgcolor: COLORS.cyan,
            color: COLORS.text,
            textTransform: 'none',
            fontWeight: 600,
            boxShadow: 'none',
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
          ERROR MESSAGE
      ====================================== */}

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* ======================================
          SUCCESS MESSAGE
      ====================================== */}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      {/* ======================================
          QUICK FILTER TABS
      ====================================== */}

      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
        sx={{ mb: 2.5 }}
      >
        {[
          { key: 'ALL', label: 'All products', count: products.length },
          { key: 'ONLINE', label: 'Online', count: onlineProducts.length },
          { key: 'LOW_STOCK', label: 'Low stock', count: lowStockProducts.length }
        ].map((tab) => {
          const selected = activeTab === tab.key;

          return (
            <Button
              key={tab.key}
              variant="outlined"
              disabled={busy}
              onClick={() => changeTab(tab.key)}
              sx={{
                textTransform: 'none',
                borderColor: selected ? COLORS.cyan : COLORS.border,
                bgcolor: selected ? COLORS.cyan : '#FFFFFF',
                color: COLORS.text,
                fontWeight: selected ? 700 : 500,
                fontSize: 12,
                px: 2,
                '&:hover': {
                  bgcolor: COLORS.cyanLight,
                  borderColor: COLORS.cyan
                }
              }}
            >
              {tab.label} {loading ? '—' : tab.count}
            </Button>
          );
        })}
      </Stack>

      {/* ======================================
          AI IMAGE SEARCH
      ====================================== */}

      <Box
        sx={{
          bgcolor: COLORS.cyanLight,
          borderRadius: 2,
          p: 2,
          mb: 2.5
        }}
      >
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
          spacing={2}
        >
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Box
              sx={{
                width: 42,
                height: 42,
                bgcolor: '#FFFFFF',
                borderRadius: 1.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: COLORS.text
              }}
            >
              <PictureOutlined style={{ fontSize: 19 }} />
            </Box>

            <Box>
              <Typography fontSize={13} fontWeight={700} color={COLORS.text}>
                AI Image Search
              </Typography>
              <Typography fontSize={11} color={COLORS.muted}>
                Find a product in your inventory with a photo. Upload an image or use your camera.
              </Typography>
            </Box>
          </Stack>

          <Stack direction="row" spacing={1}>
            <Tooltip title="AI image search API is not connected yet">
              <span>
                <Button
                  disabled
                  variant="outlined"
                  startIcon={<UploadOutlined />}
                  sx={{ textTransform: 'none', fontSize: 11 }}
                >
                  Upload Image
                </Button>
              </span>
            </Tooltip>

            <Tooltip title="Camera search is not connected yet">
              <span>
                <Button
                  disabled
                  variant="outlined"
                  startIcon={<CameraOutlined />}
                  sx={{ textTransform: 'none', fontSize: 11 }}
                >
                  Use Camera
                </Button>
              </span>
            </Tooltip>
          </Stack>
        </Stack>
      </Box>

      {/* ======================================
          SEARCH AND FILTER
      ====================================== */}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1} sx={{ mb: 2.5 }}>
        {/* SEARCH */}
        <TextField
          fullWidth
          size="small"
          disabled={busy}
          placeholder="Search products by name or ID"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            resetPage();
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined />
                </InputAdornment>
              )
            }
          }}
          sx={{
            bgcolor: '#FFFFFF',
            '& .MuiOutlinedInput-root': { borderRadius: 1.5 }
          }}
        />

        {/* CATEGORY FILTER */}
        <Select
          size="small"
          disabled={busy}
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            resetPage();
          }}
          sx={{
            minWidth: 160,
            bgcolor: '#FFFFFF',
            borderRadius: 1.5,
            fontSize: 12
          }}
        >
          <MenuItem value="ALL">All categories</MenuItem>
          {categories.map((category) => (
            <MenuItem key={category.categoryId} value={String(category.categoryId)}>
              {category.categoryName}
            </MenuItem>
          ))}
        </Select>

        {/* STATUS FILTER */}
        <Select
          size="small"
          disabled={busy}
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
            resetPage();
          }}
          sx={{
            minWidth: 145,
            bgcolor: '#FFFFFF',
            borderRadius: 1.5,
            fontSize: 12
          }}
        >
          <MenuItem value="ALL">All statuses</MenuItem>
          <MenuItem value="ACTIVE">Active</MenuItem>
          <MenuItem value="INACTIVE">Disabled</MenuItem>
        </Select>
      </Stack>

      {/* ======================================
          PRODUCT TABLE
      ====================================== */}

      <Card sx={cardSx}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table
            sx={{
              minWidth: 1100,
              '& .MuiTableCell-root': { borderColor: COLORS.border }
            }}
          >
            {/* TABLE HEADER */}
            <TableHead>
              <TableRow sx={{ bgcolor: '#F7F9FC' }}>
                {[
                  'Product',
                  'Category',
                  'Selling price',
                  'Stock',
                  'Status',
                  'Online sale',
                  'Actions'
                ].map((label) => (
                  <TableCell
                    key={label}
                    align={label === 'Actions' ? 'center' : 'left'}
                    sx={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.muted,
                      py: 1.75
                    }}
                  >
                    {label.toUpperCase()}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            {/* TABLE BODY */}
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <Stack alignItems="center" spacing={1}>
                      <CircularProgress size={28} />
                      <Typography fontSize={12} color={COLORS.muted}>
                        Loading products...
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
                        bgcolor: isEditing ? '#F0FCFE' : '#FFFFFF',
                        '&:last-child td': { borderBottom: 0 }
                      }}
                    >
                      {/* PRODUCT NAME */}
                      <TableCell>
                        <Stack direction="row" spacing={1.5} alignItems="center">
                          <Avatar
                            src={product.primaryImageUrl || undefined}
                            variant="rounded"
                            sx={{
                              width: 42,
                              height: 42,
                              bgcolor: COLORS.cyanLight,
                              color: COLORS.text,
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
                                sx={{ minWidth: 180, bgcolor: '#FFFFFF' }}
                              />
                            ) : (
                              <Typography fontSize={12} fontWeight={700} color={COLORS.text} noWrap>
                                {product.productName}
                              </Typography>
                            )}
                            <Typography fontSize={10} color={COLORS.muted} sx={{ mt: 0.5 }}>
                              ID: {product.productId}
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
                            sx={{ minWidth: 145, bgcolor: '#FFFFFF', fontSize: 12 }}
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
                                  {category.status !== 'ACTIVE' ? ' (Inactive)' : ''}
                                </MenuItem>
                              );
                            })}
                          </Select>
                        ) : (
                          <Typography fontSize={11} color={COLORS.text}>
                            {product.categoryName || '—'}
                          </Typography>
                        )}
                      </TableCell>

                      {/* SELLING PRICE */}
                      <TableCell>
                        <Typography fontSize={11} color={COLORS.text}>
                          {displayPrice(product)}
                        </Typography>
                      </TableCell>

                      {/* STOCK */}
                      <TableCell>
                        <Typography fontSize={12} color={COLORS.text}>
                          {product.totalStock ?? 0}
                        </Typography>
                        {lowStock && (
                          <Typography fontSize={10} color="warning.main">
                            Low stock
                          </Typography>
                        )}
                      </TableCell>

                      {/* PRODUCT STATUS */}
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip title={isActive ? 'Deactivate Product' : 'Activate Product'}>
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
                                  '& .MuiSwitch-switchBase.Mui-checked': { color: COLORS.green },
                                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: COLORS.green }
                                }}
                              />
                            </span>
                          </Tooltip>

                          <Chip
                            size="small"
                            label={isActive ? 'Active' : 'Disabled'}
                            sx={{
                              height: 23,
                              fontSize: 10,
                              bgcolor: isActive ? '#E8F6F0' : '#F0F2F5',
                              color: isActive ? COLORS.green : COLORS.muted
                            }}
                          />
                        </Stack>
                      </TableCell>

                      {/* ONLINE SALE */}
                      <TableCell>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Tooltip title={`${product.onlineVariantCount ?? 0}/${product.variantCount ?? 0} variants enabled for online sales`}>
                            <span>
                              <Switch checked={isOnline} disabled size="small" />
                            </span>
                          </Tooltip>
                          <Typography fontSize={11} color={COLORS.muted}>
                            {isOnline ? 'On' : 'Off'}
                          </Typography>
                        </Stack>
                      </TableCell>

                      {/* ACTIONS */}
                      <TableCell align="center">
                        {isEditing ? (
                          <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                            <Tooltip title="Save Changes">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={saving}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    saveInlineEdit(product.productId);
                                  }}
                                  sx={{
                                    color: COLORS.green,
                                    bgcolor: '#E8F6F0',
                                    '&:hover': { bgcolor: '#D4F0E4' }
                                  }}
                                >
                                  {saving ? <CircularProgress size={16} /> : <CheckOutlined />}
                                </IconButton>
                              </span>
                            </Tooltip>

                            <Tooltip title="Cancel">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={saving}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    cancelInlineEdit();
                                  }}
                                  sx={{
                                    color: COLORS.red,
                                    bgcolor: '#FCECEC',
                                    '&:hover': { bgcolor: '#FADADA' }
                                  }}
                                >
                                  <CloseOutlined />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Stack>
                        ) : (
                          <Stack direction="row" alignItems="center" justifyContent="center" spacing={1}>
                            <Button
                              size="small"
                              disabled={busy}
                              onClick={(event) => {
                                event.stopPropagation();
                                viewProduct(product.productId);
                              }}
                              sx={{
                                minWidth: 0,
                                px: 1,
                                fontSize: 11,
                                textTransform: 'none',
                                color: COLORS.text
                              }}
                            >
                              View
                            </Button>

                            <Tooltip title="Quick Edit">
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={busy}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    startInlineEdit(product);
                                  }}
                                  sx={{
                                    color: COLORS.muted,
                                    '&:hover': {
                                      color: COLORS.text,
                                      bgcolor: COLORS.cyanLight
                                    }
                                  }}
                                >
                                  <EditOutlined style={{ fontSize: 14 }} />
                                </IconButton>
                              </span>
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
                    <Typography fontSize={13} fontWeight={600} color={COLORS.text}>
                      {products.length === 0
                        ? 'No products available'
                        : 'No matching products found'}
                    </Typography>
                    <Typography fontSize={11} color={COLORS.muted} sx={{ mt: 1 }}>
                      {products.length === 0
                        ? 'Products will appear here after they are added.'
                        : 'Try changing your search or filters.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Divider />

        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems="center"
          spacing={2}
          sx={{ px: 2, py: 1.5 }}
        >
          <Typography fontSize={11} color={COLORS.muted}>
            Showing {showingFrom}–{showingTo} of {filteredProducts.length} products
          </Typography>

          <Pagination
            count={pageCount}
            page={currentPage}
            disabled={busy}
            onChange={(_, value) => setPage(value)}
            size="small"
            shape="rounded"
            sx={{
              '& .Mui-selected': {
                bgcolor: `${COLORS.cyan} !important`,
                color: COLORS.text
              }
            }}
          />
        </Stack>
      </Card>

      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mt: 2.5 }}>
        <Typography fontSize={11} color={COLORS.muted}>
          Online product counts reflect variants enabled for online sales.
        </Typography>
        <Typography fontSize={11} color={COLORS.muted}>
          Inventory data loaded from THORS.
        </Typography>
      </Stack>

      {/* ======================================
          CHANGE PRODUCT STATUS DIALOG
      ====================================== */}

      <Dialog open={Boolean(statusDialogProduct)} onClose={closeStatusDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, color: COLORS.text }}>
          {statusDialogProduct?.status === 'ACTIVE' ? 'Deactivate Product' : 'Activate Product'}
        </DialogTitle>

        <DialogContent>
          <DialogContentText>
            Are you sure you want to {statusDialogProduct?.status === 'ACTIVE' ? 'deactivate' : 'activate'}{' '}
            <strong>{statusDialogProduct?.productName}</strong>?
          </DialogContentText>

          {statusDialogProduct?.status === 'ACTIVE' && (
            <Alert severity="warning" sx={{ mt: 2 }}>
              This product will no longer be available for customers to purchase online.
              Existing product data and inventory will be preserved.
            </Alert>
          )}

          {statusDialogProduct?.status === 'INACTIVE' && (
            <Alert severity="info" sx={{ mt: 2 }}>
              This product will become active again. Online availability still depends on the settings of its variants.
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={closeStatusDialog} disabled={statusSaving} sx={{ textTransform: 'none', color: COLORS.muted }}>
            Cancel
          </Button>

          <Button
            variant="contained"
            disabled={statusSaving}
            onClick={confirmChangeProductStatus}
            startIcon={statusSaving ? <CircularProgress size={16} color="inherit" /> : null}
            sx={{
              textTransform: 'none',
              bgcolor: statusDialogProduct?.status === 'ACTIVE' ? COLORS.red : COLORS.green,
              '&:hover': {
                bgcolor: statusDialogProduct?.status === 'ACTIVE' ? '#B83D3D' : '#1B6B54'
              }
            }}
          >
            {statusSaving ? 'Saving...' : statusDialogProduct?.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
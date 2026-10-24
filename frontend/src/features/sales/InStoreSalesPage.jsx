import { useEffect, useMemo, useState } from 'react';
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
  DialogTitle,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { SearchOutlined, DeleteOutlined, PlusOutlined, MinusOutlined, ShoppingCartOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { getProducts, getProductById } from '../../services/productService';

const C = {
  text: '#202D42',
  muted: '#75869F',
  border: '#E5EBF2',
  main: '#8DE9F2',
  selected: '#DDF7FA',
  bg: '#F8FAFC',
  disabled: '#F0F3F7'
};

const money = (value) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const isActive = (value) => String(value ?? '').toUpperCase() === 'ACTIVE';
const getId = (product) => product?.productId ?? product?.id;
const getVariantId = (variant) => variant?.detailId ?? variant?.variantId ?? variant?.id;
const getStock = (variant) => Number(variant?.stockQuantity ?? variant?.stock ?? 0);
const getPrice = (variant) => Number(variant?.price ?? variant?.salePrice ?? variant?.sale_price ?? 0);

const getList = (data) => {
  if (Array.isArray(data)) return data;
  return data?.content ?? data?.data ?? [];
};

const buttonSx = {
  textTransform: 'none',
  borderRadius: 2,
  fontWeight: 600
};

function ChoiceButton({ label, selected, disabled, onClick }) {
  return (
    <Button
      variant="outlined"
      disabled={disabled}
      onClick={onClick}
      sx={{
        ...buttonSx,
        minWidth: 48,
        minHeight: 32,
        px: 1.25,
        py: 0.4,
        fontSize: 12,
        lineHeight: 1.2,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? `${C.main} !important` : `${C.border} !important`,
        bgcolor: disabled ? `${C.disabled} !important` : selected ? `${C.selected} !important` : '#fff',
        color: disabled ? '#9AA7B7 !important' : C.text,
        '&:hover': {
          bgcolor: disabled ? C.disabled : C.selected,
          borderColor: C.main
        },
        '&.Mui-disabled': { opacity: 1 }
      }}
    >
      {label}
    </Button>
  );
}

function ToggleGroup({ value, onChange, children, fullWidth = false }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      fullWidth={fullWidth}
      onChange={(_, next) => next && onChange(next)}
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 1,
        '& .MuiToggleButtonGroup-grouped': {
          m: '0 !important',
          border: `1px solid ${C.border} !important`,
          borderRadius: '8px !important'
        },
        '& .MuiToggleButton-root': {
          ...buttonSx,
          px: 1.5,
          color: C.text
        },
        '& .Mui-selected': {
          bgcolor: `${C.main} !important`,
          fontWeight: 700
        }
      }}
    >
      {children}
    </ToggleButtonGroup>
  );
}

export default function InStoreSalesPage() {
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState('All products');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState(null);

  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState('');
  const [payment, setPayment] = useState('Cash');
  const [received, setReceived] = useState('');
  const [discount, setDiscount] = useState('');

  const [variantProduct, setVariantProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [loadingVariants, setLoadingVariants] = useState(false);

  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    getProducts()
      .then((response) => {
        setProducts(getList(response?.data ?? response).filter((p) => isActive(p.status)));
      })
      .catch((err) => setError(err.message || 'Unable to load products.'))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => ['All products', ...new Set(products.map((p) => p.categoryName).filter(Boolean))], [products]);

  const visibleProducts = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesCategory = category === 'All products' || product.categoryName === category;
      const matchesSearch = [product.productName, product.sku].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(keyword)
      );
      return matchesCategory && matchesSearch;
    });
  }, [products, category, search]);

  const sizes = useMemo(() => [...new Set(variants.map((v) => String(v.size ?? '')))], [variants]);

  const colors = useMemo(
    () => [...new Set(variants.filter((v) => String(v.size ?? '') === selectedSize).map((v) => String(v.color ?? '')))],
    [variants, selectedSize]
  );

  const selectedVariant = variants.find((v) => String(v.size ?? '') === selectedSize && String(v.color ?? '') === selectedColor);

  const priceRange = useMemo(() => {
    const prices = variants.map(getPrice).filter((price) => price > 0);
    if (!prices.length) return 'Price unavailable';

    const min = Math.min(...prices);
    const max = Math.max(...prices);
    return min === max ? money(min) : `${money(min)} – ${money(max)}`;
  }, [variants]);

  async function addProduct(product) {
    const id = getId(product);
    if (id == null || addingId !== null) return;

    setAddingId(id);
    setError('');
    setNotice('');
    setLoadingVariants(true);

    try {
      const response = await getProductById(id);
      const data = response?.data ?? response;
      const detail = data?.data ?? data;
      const item = detail?.product ?? detail;
      const rawVariants = detail?.variants ?? item?.variants ?? detail?.productVariants ?? item?.productVariants ?? [];

      const activeVariants = Array.isArray(rawVariants) ? rawVariants.filter((v) => isActive(v.status)) : [];

      if (!activeVariants.length) {
        setError('No active variants found for this product.');
        return;
      }

      const image =
        detail?.images?.[0]?.imageUrl ||
        item?.images?.[0]?.imageUrl ||
        product.imageUrl ||
        product.thumbnailUrl ||
        product.mainImageUrl ||
        '';

      setVariantProduct({ ...product, ...item, productId: id, image });
      setVariants(activeVariants);

      const first = activeVariants.find((v) => getStock(v) > 0) || activeVariants[0];
      setSelectedSize(String(first?.size ?? ''));
      setSelectedColor(String(first?.color ?? ''));
    } catch (err) {
      setError(err.message || 'Could not load product variants.');
    } finally {
      setAddingId(null);
      setLoadingVariants(false);
    }
  }

  function closeDialog() {
    setVariantProduct(null);
    setVariants([]);
    setSelectedSize('');
    setSelectedColor('');
  }

  function chooseSize(size) {
    setSelectedSize(size);
    const matching = variants.filter((v) => String(v.size ?? '') === size);
    const first = matching.find((v) => getStock(v) > 0) || matching[0];
    setSelectedColor(String(first?.color ?? ''));
  }

  function confirmVariant() {
    if (!variantProduct || !selectedVariant || getStock(selectedVariant) <= 0) {
      setError('Please select an available size and color.');
      return;
    }

    const productId = getId(variantProduct);
    const variantId = getVariantId(selectedVariant);

    if (variantId == null) {
      setError('Product variant ID is missing.');
      return;
    }

    const key = `${productId}-${variantId}`;
    const existing = cart.find((line) => line.key === key);
    const stock = getStock(selectedVariant);

    if (existing && existing.quantity >= stock) {
      setError('Quantity cannot exceed available stock.');
      return;
    }

    if (existing) {
      setCart((current) => current.map((line) => (line.key === key ? { ...line, quantity: line.quantity + 1 } : line)));
    } else {
      setCart((current) => [
        ...current,
        {
          key,
          productId,
          variantId,
          name: variantProduct.productName || 'Unnamed product',
          image: variantProduct.image || '',
          size: selectedVariant.size ?? '',
          color: selectedVariant.color ?? '',
          price: getPrice(selectedVariant),
          stock,
          quantity: 1
        }
      ]);
    }

    setNotice(`${variantProduct.productName || 'Product'} added to invoice.`);
    closeDialog();
  }

  function updateQuantity(key, delta) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.key !== key) return line;
          const quantity = line.quantity + delta;
          return quantity <= 0 ? null : { ...line, quantity: Math.min(quantity, line.stock) };
        })
        .filter(Boolean)
    );
  }

  const itemCount = cart.reduce((sum, line) => sum + line.quantity, 0);
  const subtotal = cart.reduce((sum, line) => sum + line.price * line.quantity, 0);
  const discountValue = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const total = subtotal - discountValue;
  const receivedValue = Math.max(0, Number(received) || 0);
  const change = Math.max(0, receivedValue - total);

  const cardSx = {
    p: 2,
    border: `1px solid ${C.border}`,
    borderRadius: 2,
    boxShadow: 'none'
  };

  function completeSale() {
    setError('');
    setNotice('');

    if (!cart.length) {
      setError('Add at least one product to the invoice.');
      return;
    }

    if (payment === 'Cash' && receivedValue < total) {
      setError('Amount received must cover the total.');
      return;
    }

    setNotice('Invoice validated. No sale has been saved to the database.');
  }

  function clearInvoice() {
    setCart([]);
    setDiscount('');
    setReceived('');
    setNotice('');
    setError('');
  }

  return (
    <Box sx={{ maxWidth: 1600, mx: 'auto', color: C.text }}>
      {error && (
        <Alert severity="error" sx={{ mb: 1.5 }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {notice && (
        <Alert severity="info" sx={{ mb: 1.5 }} onClose={() => setNotice('')}>
          {notice}
        </Alert>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '1.65fr minmax(320px, .95fr)' },
          gap: 2,
          alignItems: 'start'
        }}
      >
        {/* Product catalog */}
        <Card sx={cardSx}>
          <TextField
            fullWidth
            size="small"
            placeholder="Search products by name or SKU"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchOutlined />
                </InputAdornment>
              )
            }}
            sx={{ mb: 2 }}
          />

          <Box sx={{ mb: 2.5 }}>
            <ToggleGroup value={category} onChange={setCategory}>
              {categories.map((item) => (
                <ToggleButton key={item} value={item}>
                  {item}
                </ToggleButton>
              ))}
            </ToggleGroup>
          </Box>

          {loading ? (
            <Box sx={{ py: 8, textAlign: 'center' }}>
              <CircularProgress />
            </Box>
          ) : !visibleProducts.length ? (
            <Typography sx={{ py: 8, textAlign: 'center', color: C.muted }}>No products found.</Typography>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(175px, 1fr))',
                gap: 1.5
              }}
            >
              {visibleProducts.map((product) => {
                const id = getId(product);
                const image = product.imageUrl || product.thumbnailUrl || product.mainImageUrl || product.images?.[0]?.imageUrl;
                const min = product.minPrice;
                const max = product.maxPrice;
                const price =
                  min == null ? 'View price' : max == null || Number(min) === Number(max) ? money(min) : `${money(min)} – ${money(max)}`;

                return (
                  <Card
                    key={id}
                    onClick={() => addProduct(product)}
                    sx={{
                      p: 1,
                      border: `1px solid ${C.border}`,
                      borderRadius: 2,
                      boxShadow: 'none',
                      cursor: 'pointer',
                      opacity: addingId === id ? 0.6 : 1,
                      transition: 'border-color .2s, transform .2s',
                      '&:hover': { borderColor: C.main, transform: 'translateY(-2px)' }
                    }}
                  >
                    <Box
                      sx={{
                        height: 118,
                        mb: 1,
                        bgcolor: C.bg,
                        borderRadius: 1.5,
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      {image ? (
                        <Box
                          component="img"
                          src={image}
                          alt={product.productName}
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        <ShoppingCartOutlined style={{ fontSize: 32, color: '#B7C3D2' }} />
                      )}
                    </Box>

                    <Typography sx={{ fontSize: 13, fontWeight: 700, minHeight: 36 }}>
                      {product.productName || 'Unnamed product'}
                    </Typography>
                    <Typography sx={{ fontSize: 13, fontWeight: 700, mt: 1 }}>{price}</Typography>
                    {addingId === id && <CircularProgress size={16} sx={{ mt: 1 }} />}
                  </Card>
                );
              })}
            </Box>
          )}
        </Card>

        {/* Invoice */}
        <Card sx={cardSx}>
          <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 1.5 }}>Invoice</Typography>

          <TextField
            fullWidth
            size="small"
            label="Customer"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            sx={{ mb: 1.5 }}
          />

          {!cart.length ? (
            <Box sx={{ py: 6, textAlign: 'center', bgcolor: C.bg, borderRadius: 2, mb: 2 }}>
              <ShoppingCartOutlined style={{ fontSize: 28, color: '#A9B6C8' }} />
              <Typography sx={{ mt: 1, fontSize: 13, fontWeight: 600 }}>Your invoice is empty</Typography>
              <Typography sx={{ fontSize: 12, color: C.muted }}>Click a product to choose its size and color.</Typography>
            </Box>
          ) : (
            <Stack spacing={1.5} sx={{ mb: 2 }}>
              {cart.map((line) => (
                <Box key={line.key}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Avatar variant="rounded" src={line.image} sx={{ width: 54, height: 54, bgcolor: C.bg }}>
                      <ShoppingCartOutlined />
                    </Avatar>

                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{line.name}</Typography>
                      <Typography sx={{ fontSize: 10.5, color: C.muted }}>
                        {line.size || 'Default size'} / {line.color || 'Default color'}
                        {' · '}
                        {money(line.price)} each
                      </Typography>

                      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mt: 0.75 }}>
                        <IconButton
                          size="small"
                          onClick={() => updateQuantity(line.key, -1)}
                          sx={{ border: `1px solid ${C.border}`, borderRadius: 1, p: 0.5 }}
                        >
                          <MinusOutlined style={{ fontSize: 10 }} />
                        </IconButton>
                        <Typography sx={{ minWidth: 20, textAlign: 'center', fontSize: 12 }}>{line.quantity}</Typography>
                        <IconButton
                          size="small"
                          disabled={line.quantity >= line.stock}
                          onClick={() => updateQuantity(line.key, 1)}
                          sx={{ border: `1px solid ${C.border}`, borderRadius: 1, p: 0.5 }}
                        >
                          <PlusOutlined style={{ fontSize: 10 }} />
                        </IconButton>
                      </Stack>
                    </Box>

                    <Box sx={{ textAlign: 'right' }}>
                      <Typography sx={{ fontSize: 12.5, fontWeight: 700 }}>{money(line.price * line.quantity)}</Typography>
                      <IconButton size="small" onClick={() => setCart((current) => current.filter((item) => item.key !== line.key))}>
                        <DeleteOutlined style={{ fontSize: 13 }} />
                      </IconButton>
                    </Box>
                  </Stack>
                  <Divider sx={{ mt: 1.5, borderColor: C.border }} />
                </Box>
              ))}
            </Stack>
          )}

          <Stack spacing={1.5}>
            <Stack direction="row" justifyContent="space-between">
              <Typography sx={{ fontSize: 12, color: C.muted }}>Items ({itemCount})</Typography>
              <Typography sx={{ fontSize: 12, fontWeight: 600 }}>{money(subtotal)}</Typography>
            </Stack>

            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography sx={{ flex: 1, fontSize: 12, color: C.muted }}>Discount (₫)</Typography>
              <TextField
                size="small"
                type="number"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                inputProps={{ min: 0, max: subtotal }}
                sx={{ width: 130 }}
              />
            </Stack>

            <Divider sx={{ borderColor: C.border }} />

            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography sx={{ fontWeight: 700 }}>Total to pay</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 800 }}>{money(total)}</Typography>
            </Stack>

            <Typography sx={{ fontSize: 12, fontWeight: 700 }}>Payment method</Typography>
            <ToggleGroup value={payment} onChange={setPayment} fullWidth>
              <ToggleButton value="Cash">Cash</ToggleButton>
              <ToggleButton value="Bank transfer">Bank transfer</ToggleButton>
            </ToggleGroup>

            {payment === 'Cash' && (
              <>
                <TextField
                  fullWidth
                  size="small"
                  type="number"
                  label="Amount received (₫)"
                  value={received}
                  onChange={(e) => setReceived(e.target.value)}
                  inputProps={{ min: 0 }}
                />
                <Stack direction="row" justifyContent="space-between" sx={{ p: 1.25, bgcolor: C.bg, borderRadius: 1.5 }}>
                  <Typography sx={{ fontSize: 12, color: C.muted }}>Change due</Typography>
                  <Typography sx={{ fontWeight: 700 }}>{money(change)}</Typography>
                </Stack>
              </>
            )}

            <Button
              fullWidth
              variant="contained"
              startIcon={<CheckCircleOutlined />}
              onClick={completeSale}
              disabled={!cart.length}
              sx={{
                ...buttonSx,
                py: 1.2,
                bgcolor: C.main,
                color: C.text,
                '&:hover': { bgcolor: '#6BDCE7' }
              }}
            >
              Complete sale · {money(total)}
            </Button>

            <Button
              fullWidth
              variant="outlined"
              onClick={clearInvoice}
              sx={{
                ...buttonSx,
                py: 1,
                borderColor: C.border,
                color: C.text,
                '&:hover': { bgcolor: C.main, borderColor: C.main }
              }}
            >
              Clear invoice
            </Button>
          </Stack>
        </Card>
      </Box>

      {/* Compact variant popup */}
      <Dialog
        open={Boolean(variantProduct)}
        onClose={closeDialog}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            width: '100%',
            maxWidth: 360,
            m: 1.5,
            borderRadius: 3,
            overflow: 'hidden'
          }
        }}
        sx={{
          '& .MuiDialog-container': { alignItems: 'center' },
          '& .MuiDialog-paper': { maxHeight: 'calc(100% - 24px)' }
        }}
      >
        <DialogTitle sx={{ fontSize: 15, fontWeight: 800, px: 2, py: 1.5 }}>Select product variant</DialogTitle>

        <DialogContent
          dividers
          sx={{
            px: 2,
            py: 1.5,
            borderColor: C.border,
            overflowY: 'hidden'
          }}
        >
          {loadingVariants ? (
            <Box sx={{ py: 3, textAlign: 'center' }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <>
              <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.5 }}>
                <Avatar
                  variant="rounded"
                  src={variantProduct?.image || ''}
                  sx={{ width: 56, height: 56, bgcolor: C.bg, borderRadius: 1.5 }}
                >
                  <ShoppingCartOutlined />
                </Avatar>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 800, lineHeight: 1.35 }}>{variantProduct?.productName}</Typography>
                  <Typography sx={{ mt: 0.4, fontSize: 13, fontWeight: 800, color: '#087F8C' }}>{priceRange}</Typography>
                </Box>
              </Stack>

              <Divider sx={{ mb: 1.5, borderColor: C.border }} />

              <Typography sx={{ fontSize: 12, fontWeight: 800, mb: 1 }}>Size</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1} sx={{ mb: 1.75 }}>
                {sizes.map((size) => {
                  const hasStock = variants.some((v) => String(v.size ?? '') === size && getStock(v) > 0);

                  return (
                    <ChoiceButton
                      key={size || 'default-size'}
                      label={size || 'Default'}
                      selected={selectedSize === size}
                      disabled={!hasStock}
                      onClick={() => chooseSize(size)}
                    />
                  );
                })}
              </Stack>

              <Divider sx={{ mb: 1.5, borderColor: C.border }} />

              <Typography sx={{ fontSize: 12, fontWeight: 800, mb: 1 }}>Color</Typography>
              <Stack direction="row" flexWrap="wrap" gap={1}>
                {colors.map((color) => {
                  const variant = variants.find((v) => String(v.size ?? '') === selectedSize && String(v.color ?? '') === color);

                  return (
                    <ChoiceButton
                      key={color || 'default-color'}
                      label={color || 'Default'}
                      selected={selectedColor === color}
                      disabled={getStock(variant) <= 0}
                      onClick={() => setSelectedColor(color)}
                    />
                  );
                })}
              </Stack>

              {selectedVariant && (
                <Stack direction="row" justifyContent="space-between" sx={{ mt: 1.5 }}>
                  <Typography sx={{ fontSize: 11, color: C.muted }}>Selected price</Typography>
                  <Typography sx={{ fontSize: 12, fontWeight: 800 }}>{money(getPrice(selectedVariant))}</Typography>
                </Stack>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 2, py: 1.25, gap: 1 }}>
          <Button
            onClick={closeDialog}
            sx={{
              ...buttonSx,
              minHeight: 32,
              px: 1.75,
              fontSize: 12,
              color: C.text,
              border: `1px solid ${C.border}`,
              '&:hover': {
                bgcolor: C.main,
                borderColor: C.main
              }
            }}
          >
            Cancel
          </Button>

          <Button
            variant="contained"
            disabled={!selectedVariant || getStock(selectedVariant) <= 0 || loadingVariants}
            onClick={confirmVariant}
            sx={{
              ...buttonSx,
              minHeight: 32,
              px: 1.75,
              fontSize: 12,
              bgcolor: C.main,
              color: C.text,
              '&:hover': { bgcolor: '#6BDCE7' }
            }}
          >
            Add to invoice
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Box, Button, CircularProgress, Dialog, IconButton, Typography } from '@mui/material';
import { MinusOutlined, PlusOutlined } from '@ant-design/icons';
import { getProductById } from 'services/productService';
import { variantSalesOf } from '../hooks';
import { C, NO_EFFECTS, outlineButtonSx, primaryButtonSx } from '../theme';
import { getPrice, getProductStock, getStock, isActive, money, priceRangeText } from '../utils';

// Chọn size, màu, số lượng của một sản phẩm. target: { product, line } (line: dòng đang sửa trong hóa đơn)
export default function VariantDialog({ target, cart, otherTabsQty, onConfirm, onError, onClose }) {
  const [variantProduct, setVariantProduct] = useState(null);
  const [variants, setVariants] = useState([]);
  const [selectedSize, setSelectedSize] = useState('');
  const [selectedColor, setSelectedColor] = useState('');
  const [variantQuantity, setVariantQuantity] = useState(1);
  const [variantQtyDraft, setVariantQtyDraft] = useState(null);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const editingKey = target?.line?.key ?? null;

  useEffect(() => {
    if (!target) return undefined;
    let active = true;
    const { product, line } = target;
    const id = product.productId;
    setLoadingVariants(true);
    Promise.all([getProductById(id), variantSalesOf(id)])
      .then(([detail, sales]) => {
        if (!active) return;
        const activeVariants = detail.variants.filter(isActive);
        if (!activeVariants.length) {
          onError('Sản phẩm chưa có biến thể hoạt động.');
          onClose();
          return;
        }
        const image = detail.images[0]?.imageUrl || product.primaryImageUrl || '';
        setVariantProduct({ ...product, ...detail.product, productId: id, image });
        // Số lượng còn bán được đã trừ hàng giữ cho đơn khác
        setVariants(
          activeVariants.map((v) => {
            const sale = sales[v.detailId];
            return { ...v, originalPrice: getPrice(v), price: sale?.price ?? getPrice(v), stockQuantity: sale?.available ?? getStock(v) };
          })
        );
        setSelectedSize(line ? String(line.size ?? '') : '');
        setSelectedColor(line ? String(line.color ?? '') : '');
        setVariantQuantity(line ? line.quantity : 1);
      })
      .catch((err) => {
        if (!active) return;
        onError(err.message || 'Không thể tải biến thể sản phẩm.');
        onClose();
      })
      .finally(() => active && setLoadingVariants(false));
    return () => {
      active = false;
    };
  }, [target]);

  function resetDialog() {
    setVariantProduct(null);
    setVariants([]);
    setSelectedSize('');
    setSelectedColor('');
    setVariantQuantity(1);
  }

  const sizes = useMemo(() => [...new Set(variants.map((v) => String(v.size ?? '')).filter(Boolean))], [variants]);
  const colors = useMemo(() => [...new Set(variants.map((v) => String(v.color ?? '')).filter(Boolean))], [variants]);

  const selectedVariant = useMemo(() => {
    if (!selectedSize || !selectedColor) return null;
    return variants.find((v) => String(v.size ?? '') === selectedSize && String(v.color ?? '') === selectedColor) || null;
  }, [variants, selectedSize, selectedColor]);

  const priceRange = useMemo(() => {
    const prices = variants.map(getPrice).filter((price) => price > 0);
    if (!prices.length) return 'Liên hệ';
    return priceRangeText(Math.min(...prices), Math.max(...prices));
  }, [variants]);

  // Khoảng giá gốc, chỉ hiện gạch ngang khi có biến thể được giảm
  const originalRange = useMemo(() => {
    if (!variants.some((v) => v.originalPrice > getPrice(v))) return '';
    const prices = variants.map((v) => Number(v.originalPrice)).filter((price) => price > 0);
    return priceRangeText(Math.min(...prices), Math.max(...prices));
  }, [variants]);

  const variantKey = selectedVariant ? `${variantProduct.productId}-${selectedVariant.detailId}` : '';
  const inCartQty = selectedVariant ? (cart.find((line) => line.key === variantKey && line.key !== editingKey)?.quantity ?? 0) : 0;
  const otherQty = selectedVariant ? otherTabsQty(variantKey) : 0;
  const available = selectedVariant ? Math.max(0, getStock(selectedVariant) - inCartQty - otherQty) : null;
  const availableNote = selectedVariant
    ? `Chỉ thêm được ${available} sản phẩm (tồn ${getStock(selectedVariant)}, hóa đơn này đã có ${inCartQty}${otherQty ? `, hóa đơn chờ khác ${otherQty}` : ''}).`
    : '';

  function commitVariantQuantity() {
    const qty = parseInt(variantQtyDraft, 10);
    setVariantQtyDraft(null);
    if (isNaN(qty) || qty <= 0) return;
    const max = available ?? qty;
    if (qty > max) onError(availableNote);
    setVariantQuantity(Math.max(1, Math.min(qty, max)));
  }

  const chooseSize = (size) => setSelectedSize((prev) => (prev === size ? '' : size));
  const chooseColor = (color) => setSelectedColor((prev) => (prev === color ? '' : color));

  function confirmVariant() {
    if (!variantProduct || !selectedVariant || getStock(selectedVariant) <= 0) {
      onError('Vui lòng chọn kích cỡ và màu sắc còn hàng.');
      return;
    }
    if (variantQuantity > available) {
      onError(availableNote);
      return;
    }
    onConfirm(
      {
        key: variantKey,
        productId: variantProduct.productId,
        variantId: selectedVariant.detailId,
        name: variantProduct.productName || 'Sản phẩm',
        image: variantProduct.image || '',
        size: selectedVariant.size ?? '',
        color: selectedVariant.color ?? '',
        price: getPrice(selectedVariant),
        originalPrice: selectedVariant.originalPrice,
        stock: getStock(selectedVariant),
        quantity: variantQuantity
      },
      editingKey
    );
  }

  return (
    <Dialog
      className={NO_EFFECTS}
      open={Boolean(target)}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{
        transition: { onExited: resetDialog },
        paper: {
          sx: {
            maxWidth: 500,
            width: '100%',
            borderRadius: 3.5,
            m: 2,
            p: 0,
            overflow: 'hidden',
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
          }
        }
      }}
    >
      <Box sx={{ p: { xs: 2.25, sm: 2.75 } }}>
        {/* Header Modal */}
        <Box sx={{ mb: 2 }}>
          <Typography sx={{ fontSize: 16.5, fontWeight: 800, color: C.text }}>Chọn biến thể sản phẩm</Typography>
        </Box>

        {loadingVariants || !variantProduct ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <CircularProgress size={28} sx={{ color: C.cyan }} />
          </Box>
        ) : (
          <>
            {/* Tóm tắt sản phẩm đang chọn */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 1.5,
                pb: 1.75,
                borderBottom: `1px solid ${C.borderLight}`
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Box
                  component="img"
                  src={variantProduct?.image || undefined}
                  alt={variantProduct?.productName}
                  sx={{
                    width: 58,
                    height: 58,
                    borderRadius: 2,
                    objectFit: 'cover',
                    bgcolor: C.bg,
                    border: `1px solid ${C.border}`
                  }}
                />
                <Box>
                  <Typography sx={{ fontSize: 15, fontWeight: 800, color: C.text, lineHeight: 1.25 }}>
                    {variantProduct?.productName}
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.35 }}>
                    {originalRange && (
                      <Typography sx={{ fontSize: 12, color: C.subtle, textDecoration: 'line-through' }}>{originalRange}</Typography>
                    )}
                    <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{priceRange}</Typography>
                  </Box>
                </Box>
              </Box>

              {/* Thông tin Tồn kho & Biến thể góc phải (cùng size và màu) */}
              <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.muted, lineHeight: 1.2 }}>
                  {selectedVariant
                    ? `Tồn: ${getStock(selectedVariant)}${inCartQty ? ` · Trong hóa đơn: ${inCartQty}` : ''}${otherQty ? ` · Hóa đơn chờ khác: ${otherQty}` : ''}`
                    : variantProduct
                      ? `Tồn: ${getProductStock(variantProduct)}`
                      : ''}
                </Typography>
                <Typography sx={{ fontSize: 12, fontWeight: 600, color: C.muted, mt: 0.35 }}>
                  {selectedSize ? `Size ${selectedSize}` : 'Chưa chọn size'}
                  {' · '}
                  {selectedColor ? `Màu ${selectedColor}` : 'Chưa chọn màu'}
                </Typography>
              </Box>
            </Box>

            {/* Bộ chọn Kích cỡ */}
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.body, mb: 0.85 }}>Kích cỡ</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.85 }}>
                {sizes.map((size) => {
                  const isSelected = selectedSize === size;
                  const hasStock = variants.some((v) => String(v.size ?? '') === size && getStock(v) > 0);

                  return (
                    <Box
                      key={size}
                      component="button"
                      type="button"
                      disabled={!hasStock}
                      onClick={() => chooseSize(size)}
                      sx={{
                        minWidth: 42,
                        height: 35,
                        px: 1.5,
                        borderRadius: 1.75,
                        fontFamily: 'inherit',
                        fontSize: 12.5,
                        fontWeight: isSelected ? 700 : 500,
                        bgcolor: C.surface,
                        color: !hasStock ? C.faint : isSelected ? C.text : C.body,
                        border: isSelected ? '1.5px solid #64748B' : `1.5px solid ${C.border}`,
                        cursor: hasStock ? 'pointer' : 'not-allowed',
                        opacity: hasStock ? 1 : 0.4,
                        outline: 'none'
                      }}
                    >
                      {size}
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* Bộ chọn Màu sắc */}
            <Box sx={{ mt: 2 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.body, mb: 0.85 }}>Màu sắc</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.85 }}>
                {colors.map((color) => {
                  const isSelected = selectedColor === color;
                  const inStock = variants.some(
                    (v) =>
                      String(v.color ?? '') === color && (selectedSize ? String(v.size ?? '') === selectedSize : true) && getStock(v) > 0
                  );

                  return (
                    <Box
                      key={color}
                      component="button"
                      type="button"
                      disabled={!inStock}
                      onClick={() => chooseColor(color)}
                      sx={{
                        minWidth: 50,
                        height: 35,
                        px: 1.75,
                        borderRadius: 1.75,
                        fontFamily: 'inherit',
                        fontSize: 12.5,
                        fontWeight: isSelected ? 700 : 500,
                        bgcolor: C.surface,
                        color: !inStock ? C.faint : isSelected ? C.text : C.body,
                        border: isSelected ? '1.5px solid #64748B' : `1.5px solid ${C.border}`,
                        cursor: inStock ? 'pointer' : 'not-allowed',
                        opacity: inStock ? 1 : 0.4,
                        outline: 'none'
                      }}
                    >
                      {color}
                    </Box>
                  );
                })}
              </Box>
            </Box>

            {/* Bộ chọn Số lượng */}
            <Box sx={{ mt: 2, mb: 2 }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.body, mb: 0.85 }}>Số lượng</Typography>
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  height: 35
                }}
              >
                <IconButton
                  size="small"
                  disabled={variantQuantity <= 1}
                  onClick={() => setVariantQuantity((q) => Math.max(1, q - 1))}
                  sx={{ p: 0.75 }}
                >
                  <MinusOutlined style={{ fontSize: 11, color: C.body }} />
                </IconButton>
                <Box
                  component="input"
                  type="text"
                  inputMode="numeric"
                  value={variantQtyDraft ?? variantQuantity}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setVariantQtyDraft(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  onBlur={commitVariantQuantity}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                  sx={{
                    width: 36,
                    textAlign: 'center',
                    fontSize: 13,
                    fontWeight: 700,
                    color: C.text,
                    border: 'none',
                    outline: 'none',
                    bgcolor: 'transparent',
                    p: 0
                  }}
                />
                <IconButton
                  size="small"
                  disabled={Boolean(selectedVariant && variantQuantity >= available)}
                  onClick={() => setVariantQuantity((q) => q + 1)}
                  sx={{ p: 0.75 }}
                >
                  <PlusOutlined style={{ fontSize: 11, color: C.body }} />
                </IconButton>
              </Box>
            </Box>

            {/* Footer Modal */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                pt: 2,
                borderTop: `1px solid ${C.borderLight}`
              }}
            >
              <Box>
                <Typography sx={{ fontSize: 11.5, color: C.muted }}>
                  {selectedVariant ? `Thành tiền · ${variantQuantity} sản phẩm` : 'Giá sản phẩm'}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, mt: 0.25 }}>
                  {selectedVariant
                    ? selectedVariant.originalPrice > getPrice(selectedVariant) && (
                        <Typography sx={{ fontSize: 12, color: C.subtle, textDecoration: 'line-through' }}>
                          {money(selectedVariant.originalPrice * variantQuantity)}
                        </Typography>
                      )
                    : originalRange && (
                        <Typography sx={{ fontSize: 12, color: C.subtle, textDecoration: 'line-through' }}>{originalRange}</Typography>
                      )}
                  <Typography sx={{ fontSize: 17, fontWeight: 800, color: C.text }}>
                    {selectedVariant ? money(getPrice(selectedVariant) * variantQuantity) : priceRange}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button type="button" onClick={onClose} sx={{ ...outlineButtonSx, fontSize: 11.5, height: 30, px: 1.5 }}>
                  Hủy
                </Button>

                <Button
                  type="button"
                  variant="contained"
                  disabled={!selectedVariant || available <= 0}
                  onClick={confirmVariant}
                  startIcon={<PlusOutlined style={{ fontSize: 10 }} />}
                  sx={{ ...primaryButtonSx, fontSize: 11.5, height: 30, px: 1.75, borderRadius: 1.5 }}
                >
                  {editingKey ? 'Cập nhật' : 'Thêm vào hóa đơn'}
                </Button>
              </Box>
            </Box>
          </>
        )}
      </Box>
    </Dialog>
  );
}

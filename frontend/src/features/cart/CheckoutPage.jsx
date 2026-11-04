import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  CircularProgress,
  Divider,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { TagOutlined, CloseOutlined } from '@ant-design/icons';
import { api } from 'services/http';
import { useAuth } from 'features/auth/AuthProvider';
import { fetchProvinces, fetchWards } from './vnAddress';


const SHIPPING_FEE = 0;

const PAYMENT_METHODS = [
  { value: 'COD', label: 'Thanh toán khi nhận hàng (COD)', hint: 'Trả tiền mặt cho nhân viên giao hàng.' },
  { value: 'ONLINE', label: 'Thanh toán trực tuyến (PayOS / VietQR)', hint: 'Quét mã VietQR chuyển khoản nhanh 24/7 qua mọi ứng dụng ngân hàng.' }
];

const NEW = 'new'; 
const STORAGE_KEY = 'thors:checkout';
const readStored = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
};

const money = (n) => `${new Intl.NumberFormat('vi-VN').format(n || 0)} ₫`;

const pick = (obj, ...keys) => {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return undefined;
};


function normalize(item) {
  return {
    id: pick(item, 'id', 'cartItemId', 'variantId'),
    productId: pick(item, 'productId'),
    name: pick(item, 'productName', 'name', 'title') ?? 'Sản phẩm',
    image: pick(item, 'imageUrl', 'image', 'thumbnail', 'productImage'),
    size: pick(item, 'size', 'sizeName'),
    color: pick(item, 'color', 'colorName'),
    price: Number(pick(item, 'unitPrice', 'price', 'salePrice') ?? 0),
    quantity: Number(pick(item, 'quantity', 'qty') ?? 1)
  };
}


function normalizeAddress(a) {
  return {
    id: pick(a, 'id', 'addressId'),
    name: pick(a, 'recipientName', 'recipient_name', 'receiverName') ?? '',
    phone: pick(a, 'phone') ?? '',
    province: pick(a, 'provinceName', 'province_name') ?? '',
    ward: pick(a, 'wardName', 'ward_name') ?? '',
    detail: pick(a, 'addressDetail', 'address_detail') ?? '',
    isDefault: Boolean(pick(a, 'isDefault', 'is_default'))
  };
}

const fullAddress = (a) => [a.detail, a.ward, a.province].filter(Boolean).join(', ');

function validateAddress(f) {
  const e = {};
  if (!f.receiverName.trim()) e.receiverName = 'Vui lòng nhập họ tên người nhận';
  if (!/^(0|\+84)\d{9}$/.test(f.receiverPhone.trim())) e.receiverPhone = 'Số điện thoại không hợp lệ';
  if (!f.province) e.province = 'Vui lòng chọn tỉnh / thành phố';
  if (!f.ward) e.ward = 'Vui lòng chọn phường / xã';
  if (!f.address.trim()) e.address = 'Vui lòng nhập địa chỉ cụ thể';
  return e;
}

function SectionCard({ title, children }) {
  return (
    <Card variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
      <Typography variant="h5" sx={{ mb: 2 }}>
        {title}
      </Typography>
      {children}
    </Card>
  );
}

function AddressOption({ value, selected, children }) {
  return (
    <Box
      component="label"
      sx={{
        display: 'flex',
        gap: 1,
        alignItems: 'flex-start',
        p: 1.5,
        border: '1px solid',
        borderColor: selected ? 'primary.main' : 'divider',
        bgcolor: selected ? 'action.hover' : 'transparent',
        borderRadius: 2,
        cursor: 'pointer'
      }}
    >
      <Radio value={value} sx={{ p: 0.5 }} />
      <Box sx={{ flexGrow: 1, minWidth: 0, pt: 0.5 }}>{children}</Box>
    </Box>
  );
}

function Row({ label, value }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <Typography color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 500 }}>{value}</Typography>
    </Stack>
  );
}


export default function CheckoutPage() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const { state } = useLocation();

  
  const source = useMemo(() => (state?.itemIds?.length || state?.buyNow ? state : readStored()), [state]);
  const itemIds = source?.itemIds;
  const buyNow = source?.buyNow;

  const [items, setItems] = useState(() => (buyNow ? [normalize(buyNow)] : []));
  const [loading, setLoading] = useState(!buyNow);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  
  const [addresses, setAddresses] = useState([]);
  const [addrLoading, setAddrLoading] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [saveAddress, setSaveAddress] = useState(true);
  const [errors, setErrors] = useState({});
  const [addr, setAddr] = useState({
    receiverName: account?.fullName ?? '',
    receiverPhone: account?.phone ?? '',
    province: null, 
    ward: null, 
    address: ''
  });
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [provincesLoading, setProvincesLoading] = useState(true);
  const [wardsLoading, setWardsLoading] = useState(false);
  const [geoError, setGeoError] = useState('');

  const [form, setForm] = useState({ paymentMethod: 'COD' });

  useEffect(() => {
    if (state?.itemIds?.length || state?.buyNow) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        
      }
    }
  }, [state]);

  
  useEffect(() => {
    if (buyNow || !itemIds?.length) return;
    let alive = true;
    (async () => {
      try {
        const data = await api('/cart');
        const selected = (data.items || []).map(normalize).filter((i) => itemIds.includes(i.id));
        if (alive) setItems(selected);
      } catch (e) {
        if (alive) setLoadError(e.message || 'Không tải được giỏ hàng');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [itemIds, buyNow]);

  
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await api('/addresses');
        const list = (Array.isArray(data) ? data : data?.items || []).map(normalizeAddress);
        if (!alive) return;
        setAddresses(list);
        const preferred = list.find((a) => a.isDefault) ?? list[0];
        setSelectedAddressId(preferred ? String(preferred.id) : NEW);
      } catch {
        if (alive) setSelectedAddressId(NEW);
      } finally {
        if (alive) setAddrLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  
  useEffect(() => {
    let alive = true;
    fetchProvinces()
      .then((list) => alive && setProvinces(list))
      .catch(() => alive && setGeoError('Không tải được danh sách tỉnh / thành phố. Vui lòng tải lại trang.'))
      .finally(() => alive && setProvincesLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  
  const provinceCode = addr.province?.code;
  useEffect(() => {
    if (!provinceCode) {
      setWards([]);
      return undefined;
    }
    let alive = true;
    setWardsLoading(true);
    fetchWards(provinceCode)
      .then((list) => alive && setWards(list))
      .catch(() => alive && setGeoError('Không tải được danh sách phường / xã. Vui lòng thử lại.'))
      .finally(() => alive && setWardsLoading(false));
    return () => {
      alive = false;
    };
  }, [provinceCode]);

  const [voucher, setVoucher] = useState(() => {
    try {
      const raw = sessionStorage.getItem('thors:applied_voucher');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const subtotal = useMemo(() => items.reduce((s, i) => s + i.price * i.quantity, 0), [items]);
  const totalQty = useMemo(() => items.reduce((s, i) => s + i.quantity, 0), [items]);

  const voucherResult = useMemo(() => {
    if (!voucher) return null;

    const today = new Date().toISOString().slice(0, 10);
    const startDate = voucher.startDate ? String(voucher.startDate).slice(0, 10) : '';
    const endDate = voucher.endDate ? String(voucher.endDate).slice(0, 10) : '';

    if (startDate && today < startDate) {
      return { valid: false, reason: 'Chương trình ưu đãi chưa bắt đầu.' };
    }
    if (endDate && today > endDate) {
      return { valid: false, reason: 'Mã giảm giá đã hết hạn sử dụng.' };
    }
    if (voucher.status && voucher.status !== 'ACTIVE') {
      return { valid: false, reason: 'Chương trình ưu đãi hiện không khả dụng.' };
    }

    let eligibleSubtotal = 0;
    if (voucher.applyScope === 'ALL' || !voucher.applyScope) {
      eligibleSubtotal = subtotal;
    } else if (voucher.applyScope === 'SELECTED') {
      const eligibleIds = new Set((voucher.productIds || []).map(Number));
      const eligibleItems = items.filter((item) => {
        const pId = item.productId ?? item.id;
        return eligibleIds.has(Number(pId));
      });
      eligibleSubtotal = eligibleItems.reduce((s, i) => s + i.price * i.quantity, 0);
      if (eligibleSubtotal === 0) {
        return {
          valid: false,
          reason: 'Đơn hàng chưa có sản phẩm nào thuộc phạm vi áp dụng của mã này.'
        };
      }
    }

    const minOrder = Number(voucher.minOrderValue || 0);
    if (eligibleSubtotal < minOrder) {
      const diff = minOrder - eligibleSubtotal;
      return {
        valid: false,
        reason: `Chưa đủ điều kiện: Cần thêm ${new Intl.NumberFormat('vi-VN').format(diff)} ₫ để áp dụng.`
      };
    }

    let discount = 0;
    const isPercent = ['PERCENT', 'PERCENTAGE'].includes(voucher.discountType);
    const discountVal = Number(voucher.discountValue || 0);

    if (isPercent) {
      discount = Math.round((eligibleSubtotal * discountVal) / 100);
      const maxDiscount = Number(voucher.maxDiscountAmount || 0);
      if (maxDiscount > 0 && discount > maxDiscount) {
        discount = maxDiscount;
      }
    } else {
      discount = Math.min(discountVal, eligibleSubtotal);
    }

    return {
      valid: true,
      discount,
      eligibleSubtotal
    };
  }, [voucher, subtotal, items]);

  const discountAmount = voucherResult?.valid ? voucherResult.discount : 0;
  const total = Math.max(0, subtotal - discountAmount) + SHIPPING_FEE;

  const handleRemoveVoucher = () => {
    try {
      sessionStorage.removeItem('thors:applied_voucher');
    } catch {}
    setVoucher(null);
  };

  
  if (!buyNow && !itemIds?.length) return <Navigate to="/cart" replace />;

  const isNew = selectedAddressId === NEW;
  const chosen = addresses.find((a) => String(a.id) === selectedAddressId);

  const setAddrField = (key) => (event) => {
    setAddr((a) => ({ ...a, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };
  const setFormField = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  const submit = async () => {
    setSubmitError('');
    if (isNew) {
      const found = validateAddress(addr);
      setErrors(found);
      if (Object.keys(found).length) return;
    } else if (!chosen) {
      setSubmitError('Vui lòng chọn địa chỉ nhận hàng');
      return;
    }

    setSubmitting(true);
    try {
      
      let addressPart;
      if (chosen && !isNew) {
        addressPart = { shippingAddressId: chosen.id };
      } else {
        const fields = {
          recipientName: addr.receiverName.trim(),
          phone: addr.receiverPhone.trim(),
          provinceCode: addr.province.code,
          provinceName: addr.province.name,
          wardCode: addr.ward.code,
          wardName: addr.ward.name,
          addressDetail: addr.address.trim()
        };
        if (saveAddress) {
          
          const saved = await api('/addresses', { method: 'POST', body: { ...fields, isDefault: addresses.length === 0 } });
          addressPart = saved?.id != null ? { shippingAddressId: saved.id } : { shippingAddress: fields };
        } else {
          addressPart = { shippingAddress: fields };
        }
      }

      
      
      const base = { ...addressPart, paymentMethod: form.paymentMethod };
      const body = buyNow
        ? { ...base, items: [{ productVariantId: buyNow.variantId, quantity: buyNow.quantity }] }
        : { ...base, cartItemIds: items.map((i) => i.id) };
      const result = await api('/checkout', { method: 'POST', body });

      try {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem('thors:applied_voucher');
      } catch {
        
      }
      window.dispatchEvent(new Event('thors:cart-changed'));
      const receiver = chosen && !isNew ? chosen.name : addr.receiverName.trim();
      const receiverAddress =
        chosen && !isNew
          ? fullAddress(chosen)
          : [addr.address.trim(), addr.ward?.name, addr.province?.name].filter(Boolean).join(', ');

      
      navigate('/order-success', {
        replace: true,
        state: {
          orderId: result?.id,
          orderCode: result?.orderNumber ?? result?.id,
          total: result?.totalAmount ?? total,
          paymentMethod: form.paymentMethod,
          receiver,
          address: receiverAddress
        }
      });
    } catch (e) {
      setSubmitError(e.message || 'Đặt hàng thất bại, vui lòng thử lại');
    } finally {
      setSubmitting(false);
    }
  };

  const newAddressForm = (
    <Box sx={{ mt: addresses.length ? 2 : 0 }}>
      {geoError && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {geoError}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <TextField label="Họ tên người nhận" value={addr.receiverName} onChange={setAddrField('receiverName')} error={!!errors.receiverName} helperText={errors.receiverName} required />
        <TextField label="Số điện thoại" value={addr.receiverPhone} onChange={setAddrField('receiverPhone')} error={!!errors.receiverPhone} helperText={errors.receiverPhone} required />
        <Autocomplete
          options={provinces}
          value={addr.province}
          loading={provincesLoading}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(o, v) => o.code === v.code}
          noOptionsText="Không tìm thấy"
          loadingText="Đang tải..."
          onChange={(_, value) => {
            setAddr((a) => ({ ...a, province: value, ward: null }));
            setErrors((e) => ({ ...e, province: undefined, ward: undefined }));
          }}
          renderInput={(params) => <TextField {...params} label="Tỉnh / Thành phố" required error={!!errors.province} helperText={errors.province} />}
        />
        <Autocomplete
          options={wards}
          value={addr.ward}
          disabled={!addr.province}
          loading={wardsLoading}
          getOptionLabel={(o) => o.name}
          isOptionEqualToValue={(o, v) => o.code === v.code}
          noOptionsText="Không tìm thấy"
          loadingText="Đang tải..."
          onChange={(_, value) => {
            setAddr((a) => ({ ...a, ward: value }));
            setErrors((e) => ({ ...e, ward: undefined }));
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Phường / Xã"
              required
              error={!!errors.ward}
              helperText={errors.ward || (!addr.province ? 'Chọn tỉnh / thành phố trước' : undefined)}
            />
          )}
        />
        <TextField
          label="Địa chỉ cụ thể (số nhà, đường)"
          value={addr.address}
          onChange={setAddrField('address')}
          error={!!errors.address}
          helperText={errors.address}
          required
          sx={{ gridColumn: { sm: '1 / -1' } }}
        />
      </Box>
      <FormControlLabel
        sx={{ mt: 1 }}
        control={<Checkbox checked={saveAddress} onChange={(e) => setSaveAddress(e.target.checked)} />}
        label="Lưu địa chỉ này cho lần mua sau"
      />
    </Box>
  );

  return (
    <Box sx={{ maxWidth: 1180, mx: 'auto', p: { xs: 1, md: 3 } }}>
      <Stack spacing={0.5} sx={{ mb: 3 }}>
        <Typography variant="h2">Đặt hàng</Typography>
        <Typography color="text.secondary">
          {buyNow ? 'Mua ngay: kiểm tra sản phẩm và chọn địa chỉ nhận hàng.' : 'Chọn địa chỉ nhận hàng và xác nhận đơn.'}
        </Typography>
      </Stack>

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {loading ? (
        <Stack sx={{ alignItems: 'center', py: 8 }}>
          <CircularProgress />
        </Stack>
      ) : items.length === 0 ? (
        <Alert severity="warning" action={<Button component={Link} to="/cart">Về giỏ hàng</Button>}>
          Các sản phẩm đã chọn không còn trong giỏ hàng.
        </Alert>
      ) : (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 380px' }, alignItems: 'start' }}>
          <Stack spacing={3}>
            <SectionCard title="Địa chỉ nhận hàng">
              {addrLoading ? (
                <CircularProgress size={24} />
              ) : addresses.length === 0 ? (
                newAddressForm
              ) : (
                <>
                  <RadioGroup value={selectedAddressId} onChange={(e) => setSelectedAddressId(e.target.value)}>
                    <Stack spacing={1.5}>
                      {addresses.map((a) => (
                        <AddressOption key={a.id} value={String(a.id)} selected={selectedAddressId === String(a.id)}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                            <Typography variant="subtitle1">{a.name}</Typography>
                            <Typography color="text.secondary">{a.phone}</Typography>
                            {a.isDefault && <Chip size="small" color="primary" variant="outlined" label="Mặc định" />}
                          </Stack>
                          <Typography variant="body2" color="text.secondary">
                            {fullAddress(a)}
                          </Typography>
                        </AddressOption>
                      ))}
                      <AddressOption value={NEW} selected={isNew}>
                        <Typography variant="subtitle1">+ Dùng địa chỉ mới</Typography>
                      </AddressOption>
                    </Stack>
                  </RadioGroup>
                  {isNew && newAddressForm}
                </>
              )}
            </SectionCard>

            <SectionCard title="Phương thức thanh toán">
              <RadioGroup value={form.paymentMethod} onChange={setFormField('paymentMethod')}>
                {PAYMENT_METHODS.map((m) => (
                  <FormControlLabel
                    key={m.value}
                    value={m.value}
                    disabled={m.disabled}
                    control={<Radio />}
                    sx={{ alignItems: 'flex-start', mb: 1 }}
                    label={
                      <Box sx={{ pt: 0.75 }}>
                        <Typography variant="subtitle1">{m.label}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {m.hint}
                        </Typography>
                      </Box>
                    }
                  />
                ))}
              </RadioGroup>
            </SectionCard>

            <SectionCard title={`Sản phẩm (${items.length})`}>
              <Stack divider={<Divider flexItem />} spacing={2}>
                {items.map((i) => (
                  <Stack key={i.id} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                    <Box
                      component="img"
                      src={i.image}
                      alt={i.name}
                      sx={{ width: 64, height: 64, borderRadius: 2, objectFit: 'cover', bgcolor: 'action.hover', flexShrink: 0 }}
                    />
                    <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                      <Typography variant="subtitle1" noWrap>
                        {i.name}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[i.size && `Size ${i.size}`, i.color].filter(Boolean).join(' · ')}
                      </Typography>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                        {money(i.price)} × {i.quantity}
                      </Typography>
                    </Box>
                    <Typography variant="subtitle1" color="primary" sx={{ fontWeight: 600 }}>
                      {money(i.price * i.quantity)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </SectionCard>
          </Stack>

          <Stack spacing={2} sx={{ position: { md: 'sticky' }, top: { md: 80 } }}>
            <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: voucher ? 1.5 : 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <TagOutlined style={{ color: '#BE185D', fontSize: 16 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                    Mã giảm giá
                  </Typography>
                </Stack>
                <Button
                  component={Link}
                  to="/promotions"
                  size="small"
                  sx={{ textTransform: 'none', color: '#BE185D', fontWeight: 600, fontSize: 13, p: 0, minWidth: 'auto' }}
                >
                  {voucher ? 'Đổi mã khác' : 'Chọn mã'}
                </Button>
              </Stack>

              {voucher && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: voucherResult?.valid ? '#FFF1F5' : '#FEFCE8',
                    border: `1px solid ${voucherResult?.valid ? '#F8B4C8' : '#FDE047'}`
                  }}
                >
                  <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box sx={{ minWidth: 0, pr: 1 }}>
                      <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: '#202D42' }}>
                        {voucher.name}
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: '#64748B', mt: 0.25 }}>
                        {voucher.discountType === 'PERCENT'
                          ? `Giảm ${voucher.discountValue}%`
                          : `Giảm ${new Intl.NumberFormat('vi-VN').format(voucher.discountValue)} ₫`}
                        {voucher.minOrderValue > 0 && ` · Đơn từ ${new Intl.NumberFormat('vi-VN').format(voucher.minOrderValue)} ₫`}
                      </Typography>
                    </Box>
                    <IconButton size="small" onClick={handleRemoveVoucher} sx={{ color: '#94A3B8', p: 0.5 }}>
                      <CloseOutlined style={{ fontSize: 12 }} />
                    </IconButton>
                  </Stack>

                  {!voucherResult?.valid && (
                    <Typography sx={{ mt: 1, fontSize: 12, color: '#BE185D', fontWeight: 600 }}>
                      {voucherResult?.reason}
                    </Typography>
                  )}
                </Box>
              )}
            </Card>

            <Card variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
              <Typography variant="h5" sx={{ mb: 2 }}>
                Tóm tắt đơn hàng
              </Typography>
              <Stack spacing={1.5}>
                <Row label="Số sản phẩm" value={`${items.length}`} />
                <Row label="Tổng số lượng" value={`${totalQty}`} />
                <Row label="Tạm tính" value={money(subtotal)} />
                {discountAmount > 0 && (
                  <Row
                    label="Giảm giá voucher"
                    value={<Typography sx={{ color: '#BE185D', fontWeight: 700 }}>-{money(discountAmount)}</Typography>}
                  />
                )}
                <Row label="Phí vận chuyển" value={SHIPPING_FEE ? money(SHIPPING_FEE) : 'Miễn phí'} />
                <Divider />
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <Typography variant="subtitle1">Tổng thanh toán</Typography>
                  <Typography variant="h4" color="primary">
                    {money(total)}
                  </Typography>
                </Stack>
              </Stack>

            {submitError && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {submitError}
              </Alert>
            )}

            <Button fullWidth variant="contained" size="large" sx={{ mt: 2 }} onClick={submit} disabled={submitting || addrLoading}>
              {submitting ? 'Đang đặt hàng...' : 'Đặt hàng'}
            </Button>
            <Button fullWidth sx={{ mt: 1 }} disabled={submitting} onClick={() => navigate(buyNow ? -1 : '/cart')}>
              {buyNow ? 'Quay lại' : 'Quay lại giỏ hàng'}
            </Button>
          </Card>
          </Stack>
        </Box>
      )}
    </Box>
  );
}

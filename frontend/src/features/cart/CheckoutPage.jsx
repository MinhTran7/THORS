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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import { TagOutlined, CloseOutlined, ShoppingCartOutlined, DownOutlined, StarFilled, StarOutlined, PlusOutlined, ArrowLeftOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { StoreCrumb } from 'features/account/components/StoreAccount';
import { api } from 'services/http';
import { useAuth } from 'features/auth/AuthProvider';
import { fetchProvinces, fetchWards } from './vnAddress';
import { getPromotions } from 'services/promotionService';


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

const dateTimeText = (value) =>
  value ? new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

const pick = (obj, ...keys) => {
  for (const k of keys) if (obj?.[k] != null) return obj[k];
  return undefined;
};


function normalize(item) {
  const originalPrice = Number(pick(item, 'unitPrice', 'price') ?? 0);
  return {
    id: pick(item, 'id', 'cartItemId', 'variantId'),
    name: pick(item, 'productName', 'name', 'title') ?? 'Sản phẩm',
    image: pick(item, 'imageUrl', 'image', 'thumbnail', 'productImage'),
    size: pick(item, 'size', 'sizeName'),
    color: pick(item, 'color', 'colorName'),
    originalPrice,
    price: Number(item.salePrice ?? originalPrice),
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

function SectionCard({ title, icon, children }) {
  return (
    <Card variant="outlined" sx={{ p: 3, borderRadius: 3 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 2 }}>
        {icon}
        <Typography variant="h5">
          {title}
        </Typography>
      </Stack>
      {children}
    </Card>
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

  const [openPromoDialog, setOpenPromoDialog] = useState(false);
  const [allPromotions, setAllPromotions] = useState([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [expandedPromoId, setExpandedPromoId] = useState(null);
  const [openAddressDialog, setOpenAddressDialog] = useState(false);
  const [isCreatingAddress, setIsCreatingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);

  const handleSaveNewAddress = async () => {
    const found = validateAddress(addr);
    setErrors(found);
    if (Object.keys(found).length) return;

    setSavingAddress(true);
    try {
      const payload = {
        recipientName: addr.receiverName.trim(),
        phone: addr.receiverPhone.trim(),
        provinceCode: addr.province.code,
        provinceName: addr.province.name,
        wardCode: addr.ward.code,
        wardName: addr.ward.name,
        addressDetail: addr.address.trim(),
        isDefault: addresses.length === 0
      };
      const res = await api('/addresses', { method: 'POST', body: payload });
      const newId = res?.id;
      const refetched = await api('/addresses');
      const list = (Array.isArray(refetched) ? refetched : refetched?.items || []).map(normalizeAddress);
      setAddresses(list);
      if (newId != null) {
        setSelectedAddressId(String(newId));
      } else if (list.length > 0) {
        setSelectedAddressId(String(list[list.length - 1].id));
      }
      setIsCreatingAddress(false);
      setOpenAddressDialog(false);
    } catch (e) {
      setSubmitError(e.message || 'Không thể lưu địa chỉ');
    } finally {
      setSavingAddress(false);
    }
  };

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

  const voucherStatus = (p) => {
    const now = new Date();
    if (p.status !== 'ACTIVE') return { reason: 'Chương trình hiện không khả dụng' };
    if (new Date(p.startDate) > now) return { reason: 'Chưa đến thời gian áp dụng' };
    if (new Date(p.endDate) <= now) return { reason: 'Mã đã hết hạn sử dụng' };
    if (subtotal < Number(p.minOrderValue)) return {};
    const value = Number(p.discountValue);
    return { eligible: true, discount: p.discountType === 'PERCENT' ? Math.round((subtotal * value) / 100) : Math.min(value, subtotal) };
  };

  const voucherResult = voucher && voucherStatus(voucher);
  const discountAmount = voucherResult?.eligible ? voucherResult.discount : 0;
  const total = subtotal - discountAmount + SHIPPING_FEE;

  const applyVoucher = (value) => {
    try {
      if (value) sessionStorage.setItem('thors:applied_voucher', JSON.stringify(value));
      else sessionStorage.removeItem('thors:applied_voucher');
    } catch {}
    setVoucher(value);
  };

  const syncVoucher = async (current) => {
    if (!current) return;
    const res = await getPromotions().catch(() => null);
    if (!res) return;
    const fresh = (Array.isArray(res) ? res : res?.data || []).find((p) => p.promotionId === current.promotionId);
    applyVoucher(fresh || null);
    if (!fresh) setSubmitError(`Mã "${current.name}" đã hết lượt hoặc không còn khả dụng. Vui lòng chọn mã khác.`);
  };

  useEffect(() => {
    syncVoucher(voucher);
  }, []);

  
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

      
      
      const appliedPromoId = voucherResult?.eligible ? voucher.promotionId : null;
      const base = { ...addressPart, paymentMethod: form.paymentMethod, ...(appliedPromoId != null && { promotionId: appliedPromoId }) };
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
      await syncVoucher(voucher);
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
    <Box sx={{ maxWidth: 1180, mx: 'auto', px: { xs: 1, md: 3 }, pt: 0, pb: 4, mt: { xs: -1, md: -2.5 } }}>
      {!buyNow && <StoreCrumb back={{ to: '/cart', label: 'Giỏ hàng', icon: <ShoppingCartOutlined /> }} current="Đặt hàng" />}
      <Stack spacing={0.5} sx={{ mb: 2 }}>
        <Typography variant="h2">Đặt hàng</Typography>
        
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
        <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 380px' }, alignItems: 'start' }}>
          <Stack spacing={2.5}>
            <Card variant="outlined" sx={{ p: 2.5, borderRadius: 3 }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: chosen ? 1.5 : 0 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <EnvironmentOutlined style={{ color: '#DC2626', fontSize: 16 }} />
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#DC2626' }}>
                    Địa chỉ nhận hàng
                  </Typography>
                </Stack>
                <Button
                  size="small"
                  disableRipple
                  disableElevation
                  onClick={() => {
                    setIsCreatingAddress(false);
                    setOpenAddressDialog(true);
                  }}
                  sx={{
                    textTransform: 'none',
                    color: '#8EECF5 !important',
                    fontWeight: 600,
                    fontSize: 13,
                    p: 0,
                    minWidth: 'auto',
                    bgcolor: 'transparent !important',
                    boxShadow: 'none !important',
                    '&:hover': { bgcolor: 'transparent !important', color: '#8EECF5 !important', textDecoration: 'none' },
                    '&::after': { display: 'none !important' }
                  }}
                >
                  <span style={{ color: '#8EECF5' }}>Thay đổi</span>
                </Button>
              </Stack>

              {addrLoading ? (
                <CircularProgress size={20} />
              ) : chosen ? (
                <Box
                  sx={{
                    pt: 1,
                    display: 'flex',
                    flexDirection: { xs: 'column', sm: 'row' },
                    alignItems: { xs: 'flex-start', sm: 'center' },
                    gap: { xs: 1, sm: 3.5 }
                  }}
                >
                  <Box sx={{ flexShrink: 0, minWidth: { sm: 160 } }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#202D42', lineHeight: 1.3 }}>
                      {chosen.name}
                    </Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: 13.5, color: '#202D42', mt: 0.25 }}>
                      {chosen.phone}
                    </Typography>
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Typography sx={{ fontSize: 13, color: '#4B5563', lineHeight: 1.5 }}>
                      {fullAddress(chosen)}
                    </Typography>
                    {chosen.isDefault && (
                      <Chip
                        size="small"
                        color="primary"
                        variant="outlined"
                        label="Mặc định"
                        sx={{ height: 20, fontSize: 11, flexShrink: 0 }}
                      />
                    )}
                  </Box>
                </Box>
              ) : (
                <Typography sx={{ fontSize: 13, color: '#64748B', pt: 0.5 }}>
                  Chưa chọn địa chỉ nhận hàng
                </Typography>
              )}
            </Card>

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
                        {i.price < i.originalPrice && (
                          <Box component="s" sx={{ mr: 0.75 }}>
                            {money(i.originalPrice)}
                          </Box>
                        )}
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

            <SectionCard title="Phương thức thanh toán">
              <RadioGroup value={form.paymentMethod} onChange={setFormField('paymentMethod')}>
                {PAYMENT_METHODS.map((m) => (
                  <FormControlLabel
                    key={m.value}
                    value={m.value}
                    disabled={m.disabled}
                    control={<Radio sx={{ color: '#9CA3AF', '&.Mui-checked': { color: '#8EECF5 !important' } }} />}
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
                  size="small"
                  disableRipple
                  disableElevation
                  onClick={() => {
                    setOpenPromoDialog(true);
                    setPromosLoading(true);
                    getPromotions()
                      .then((res) => setAllPromotions((Array.isArray(res) ? res : res?.data || []).filter((p) => Number(p.minOrderValue) > 0)))
                      .catch(() => setAllPromotions([]))
                      .finally(() => setPromosLoading(false));
                  }}
                  sx={{
                    textTransform: 'none',
                    color: '#8EECF5 !important',
                    fontWeight: 600,
                    fontSize: 13,
                    p: 0,
                    minWidth: 'auto',
                    bgcolor: 'transparent !important',
                    boxShadow: 'none !important',
                    '&:hover': { bgcolor: 'transparent !important', color: '#8EECF5 !important', textDecoration: 'none' },
                    '&::after': { display: 'none !important' }
                  }}
                >
                  <span style={{ color: '#8EECF5' }}>{voucher ? 'Đổi mã khác' : 'Chọn mã'}</span>
                </Button>
              </Stack>

              {voucher && (
                <Box
                  sx={{
                    p: 1.5,
                    borderRadius: 2,
                    bgcolor: '#FEFCE8',
                    border: '1px solid #FEF08A'
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
                    <IconButton size="small" onClick={() => applyVoucher(null)} sx={{ color: '#94A3B8', p: 0.5 }}>
                      <CloseOutlined style={{ fontSize: 12 }} />
                    </IconButton>
                  </Stack>

                  {!voucherResult.eligible && (
                    <Typography sx={{ mt: 1, fontSize: 12, color: '#BE185D', fontWeight: 600 }}>
                      {voucherResult.reason || 'Đơn hàng chưa đạt giá trị tối thiểu để dùng mã này.'}
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

      <Dialog
        open={openPromoDialog}
        onClose={() => setOpenPromoDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            maxWidth: 490,
            width: '100%',
            borderRadius: '20px',
            p: 1,
            maxHeight: '85vh',
            bgcolor: '#FFFFFF',
            boxShadow: 'none'
          }
        }}
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 2, py: 1.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <TagOutlined style={{ color: '#BE185D', fontSize: 19 }} />
            <Typography sx={{ fontWeight: 800, fontSize: 18, color: '#1F2937' }}>
              Chọn mã giảm giá
            </Typography>
          </Stack>
          <IconButton size="small" onClick={() => setOpenPromoDialog(false)} sx={{ color: '#6B7280', '&:hover': { bgcolor: '#F3F4F6' } }}>
            <CloseOutlined style={{ fontSize: 15 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ borderColor: '#F1F5F9', maxHeight: 520, p: { xs: 1.5, sm: 2 } }}>
          {promosLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={32} sx={{ color: '#1BA3B3' }} />
            </Box>
          ) : allPromotions.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 6 }}>
              <Typography sx={{ fontSize: 14, color: '#6B7280' }}>
                Hiện không có mã khuyến mãi nào khả dụng.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {allPromotions
                .map((p) => ({ p, status: voucherStatus(p) }))
                .sort((a, b) => b.status.eligible - a.status.eligible)
                .map(({ p, status }) => {
                const isPercentType = p.discountType === 'PERCENT';
                const dVal = Number(p.discountValue || 0);
                const isCurrent = voucher?.promotionId === p.promotionId;
                const isExpanded = expandedPromoId === p.promotionId;

                return (
                  <Card
                    key={p.promotionId}
                    variant="outlined"
                    onClick={
                      status.eligible
                        ? () => {
                            applyVoucher(isCurrent ? null : p);
                            setSubmitError('');
                            setOpenPromoDialog(false);
                          }
                        : undefined
                    }
                    sx={{
                      cursor: status.eligible ? 'pointer' : 'default',
                      borderRadius: '16px',
                      border: '2px solid',
                      borderColor: isCurrent ? '#A7F2FA' : '#FEF08A',
                      bgcolor: '#FEFCE8',
                      overflow: 'hidden',
                      boxShadow: 'none !important',
                      opacity: status.eligible ? 1 : 0.55
                    }}
                  >
                    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' } }}>
                      <Box
                        sx={{
                          width: { xs: '100%', sm: 105 },
                          minWidth: { xs: '100%', sm: 105 },
                          bgcolor: '#FEF9C3',
                          borderRight: { sm: '1.5px dashed #FDE047' },
                          borderBottom: { xs: '1.5px dashed #FDE047', sm: 'none' },
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          p: 1.5,
                          textAlign: 'center'
                        }}
                      >
                        <Typography sx={{ fontSize: 20, fontWeight: 800, color: status.eligible ? '#854D0E' : '#94A3B8', lineHeight: 1.1 }}>
                          {isPercentType ? `${dVal}%` : dVal >= 1000 ? `${Math.round(dVal / 1000)}K` : `${dVal}đ`}
                        </Typography>
                        <Typography sx={{ fontSize: 10, fontWeight: 700, color: status.eligible ? '#854D0E' : '#94A3B8', mt: 0.5, textTransform: 'uppercase' }}>
                          {isPercentType ? 'GIẢM GIÁ' : 'GIẢM TIỀN'}
                        </Typography>
                      </Box>

                      <Box sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                        <Box>
                          <Typography sx={{ fontWeight: 700, fontSize: 14, color: status.eligible ? '#1F2937' : '#94A3B8' }}>
                            {p.name}
                          </Typography>
                          <Typography sx={{ fontSize: 12.5, color: '#6B7280', mt: 0.5 }}>
                            Đơn tối thiểu: <strong>{money(p.minOrderValue)}</strong>
                          </Typography>
                          {status.reason && (
                            <Typography sx={{ fontSize: 12, color: '#BE185D', fontWeight: 600, mt: 0.75 }}>
                              {status.reason}
                            </Typography>
                          )}
                        </Box>

                        <Box sx={{ display: 'flex', alignItems: 'center', pt: 1, mt: 1, borderTop: '1px solid #FEF08A' }}>
                          <Button
                            size="small"
                            disableRipple
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedPromoId((prev) => (prev === p.promotionId ? null : p.promotionId));
                            }}
                            sx={{
                              textTransform: 'none',
                              fontSize: 12,
                              fontWeight: 600,
                              color: '#0E3A41',
                              p: 0,
                              minWidth: 'auto',
                              bgcolor: 'transparent !important',
                              boxShadow: 'none !important',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                              '&:hover': { bgcolor: 'transparent !important', textDecoration: 'none', color: '#0E3A41', boxShadow: 'none !important' },
                              '&:active': { bgcolor: 'transparent !important', boxShadow: 'none !important' },
                              '&::after': { display: 'none !important' }
                            }}
                          >
                            <span>Điều kiện</span>
                            <DownOutlined
                              style={{
                                fontSize: 10,
                                transform: isExpanded ? 'rotate(180deg)' : 'none'
                              }}
                            />
                          </Button>
                        </Box>
                      </Box>
                    </Box>

                    {isExpanded && (
                      <Box
                        sx={{
                          p: 2,
                          bgcolor: '#FFFDF0',
                          borderTop: '1px dashed #FDE047',
                          fontSize: 12.5,
                          color: '#4B5563'
                        }}
                      >
                        {p.description && (
                          <Typography sx={{ fontSize: 12.5, color: '#4B5563', mb: 1, fontStyle: 'italic' }}>
                            {p.description}
                          </Typography>
                        )}
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
                          <Box>
                            <Typography sx={{ fontSize: 11.5, color: '#6B7280' }}>Mức ưu đãi</Typography>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#BE185D' }}>
                              {isPercentType ? `Giảm ${dVal}%` : `Giảm ${money(dVal)}`}
                            </Typography>
                          </Box>
                          <Box>
                            <Typography sx={{ fontSize: 11.5, color: '#6B7280' }}>Đơn tối thiểu</Typography>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#1F2937' }}>
                              {money(p.minOrderValue)}
                            </Typography>
                          </Box>
                          <Box sx={{ gridColumn: { xs: 'span 1', sm: 'span 2' } }}>
                            <Typography sx={{ fontSize: 11.5, color: '#6B7280' }}>Phạm vi áp dụng</Typography>
                            <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: '#1F2937' }}>
                              Toàn bộ đơn hàng
                            </Typography>
                          </Box>
                          <Box sx={{ gridColumn: { xs: 'span 1', sm: 'span 2' } }}>
                            <Typography sx={{ fontSize: 11.5, color: '#6B7280' }}>Thời gian áp dụng</Typography>
                            <Typography sx={{ fontSize: 12, color: '#1F2937' }}>
                              {dateTimeText(p.startDate)} đến {dateTimeText(p.endDate)}
                            </Typography>
                          </Box>
                        </Box>
                      </Box>
                    )}
                  </Card>
                );
              })}
            </Stack>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={openAddressDialog}
        onClose={() => {
          setOpenAddressDialog(false);
          setIsCreatingAddress(false);
        }}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '20px',
            overflow: 'hidden',
            maxHeight: '85vh',
            width: '100%',
            maxWidth: '490px'
          }
        }}
      >
        <DialogTitle sx={{ p: 2, px: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9' }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {isCreatingAddress && (
              <IconButton size="small" onClick={() => setIsCreatingAddress(false)} sx={{ mr: 0.5, p: 0.5 }}>
                <ArrowLeftOutlined style={{ fontSize: 14 }} />
              </IconButton>
            )}
            <Typography sx={{ fontWeight: 800, fontSize: 16, color: '#1F2937' }}>
              {isCreatingAddress ? 'Thêm địa chỉ mới' : 'Địa chỉ nhận hàng'}
            </Typography>
          </Stack>
          <IconButton
            size="small"
            onClick={() => {
              setOpenAddressDialog(false);
              setIsCreatingAddress(false);
            }}
            sx={{ color: '#94A3B8' }}
          >
            <CloseOutlined style={{ fontSize: 14 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ p: 2, px: 2.5 }}>
          {isCreatingAddress ? (
            newAddressForm
          ) : addresses.length === 0 ? (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography sx={{ fontSize: 14, color: '#6B7280' }}>
                Chưa có địa chỉ nào được lưu.
              </Typography>
            </Box>
          ) : (
            <Stack spacing={1.5}>
              {addresses.map((a) => {
                const isCurrent = selectedAddressId === String(a.id);
                return (
                  <Card
                    key={a.id}
                    variant="outlined"
                    onClick={() => {
                      setSelectedAddressId(String(a.id));
                      setOpenAddressDialog(false);
                    }}
                    sx={{
                      borderRadius: '16px',
                      border: '2px solid',
                      borderColor: isCurrent ? '#A7F2FA' : '#FEF08A',
                      bgcolor: '#FEFCE8',
                      overflow: 'hidden',
                      boxShadow: 'none !important',
                      cursor: 'pointer',
                      p: 2,
                      transition: 'border-color 0.15s ease'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mb: 0.5 }}>
                          <Typography sx={{ fontWeight: 700, fontSize: 14, color: '#1F2937' }}>
                            {a.name}
                          </Typography>
                          <Typography sx={{ fontSize: 13, color: '#64748B' }}>
                            {a.phone}
                          </Typography>
                          {a.isDefault && (
                            <Chip size="small" color="primary" variant="outlined" label="Mặc định" sx={{ height: 20, fontSize: 11 }} />
                          )}
                        </Stack>
                        <Typography sx={{ fontSize: 12.5, color: '#4B5563', lineHeight: 1.4 }}>
                          {fullAddress(a)}
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 26,
                          height: 26,
                          flexShrink: 0,
                          color: isCurrent ? '#FFB800' : '#9CA3AF'
                        }}
                      >
                        {isCurrent ? (
                          <StarFilled style={{ fontSize: 20, color: '#FFB800' }} />
                        ) : (
                          <StarOutlined style={{ fontSize: 20 }} />
                        )}
                      </Box>
                    </Box>
                  </Card>
                );
              })}
            </Stack>
          )}
        </DialogContent>

        <DialogActions sx={{ p: 1.5, px: 2, borderTop: '1px solid #F1F5F9' }}>
          {isCreatingAddress ? (
            <Button
              fullWidth
              variant="contained"
              disableRipple
              disabled={savingAddress}
              onClick={handleSaveNewAddress}
              sx={{
                bgcolor: '#A7F2FA',
                color: '#0E3A41',
                fontWeight: 700,
                fontSize: 13.5,
                borderRadius: '12px',
                py: 0.85,
                boxShadow: 'none !important',
                textTransform: 'none',
                '&:hover': { bgcolor: '#8EECF5', boxShadow: 'none !important' },
                '&:active': { bgcolor: '#A2F2FA', boxShadow: 'none !important' }
              }}
            >
              {savingAddress ? 'Đang lưu...' : 'Hoàn thành'}
            </Button>
          ) : (
            <Button
              fullWidth
              variant="contained"
              disableRipple
              onClick={() => setIsCreatingAddress(true)}
              sx={{
                bgcolor: '#A7F2FA',
                color: '#0E3A41',
                fontWeight: 700,
                fontSize: 13.5,
                borderRadius: '12px',
                py: 0.85,
                boxShadow: 'none !important',
                textTransform: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 0.75,
                '&:hover': { bgcolor: '#8EECF5', boxShadow: 'none !important' },
                '&:active': { bgcolor: '#A2F2FA', boxShadow: 'none !important' }
              }}
            >
              <PlusOutlined style={{ fontSize: 14 }} />
              <span>Thêm địa chỉ mới</span>
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
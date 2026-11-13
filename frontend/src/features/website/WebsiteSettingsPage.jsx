import { useEffect, useMemo, useState } from 'react';
import { Alert, Autocomplete, Box, CircularProgress, Typography } from '@mui/material';
import { ExportOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { AnnouncementBar, StoreFooter } from 'layouts/StorefrontLayout';
import { brand, cardSx, fs } from 'features/account/tokens';
import { BrandButton, OutlineButton } from 'features/account/components/Brand';
import { FormField, TextInput } from 'features/account/components/Form';
import { NoticeBox, PageHeader } from 'features/account/components/Blocks';
import { useToast } from 'features/account/components/Toast';
import { STORE_NAME } from 'features/account/constants';
import { SANS } from 'features/shop/storeTheme';
import { fetchProvinces, fetchWards } from 'features/cart/vnAddress';
import {
  WEBSITE_DEFAULTS,
  WEBSITE_LIMITS,
  getWebsiteSettings,
  formatHotline,
  saveWebsiteSettings,
  setWebsiteSettingsCache,
  withDefaults
} from './websiteSettings';

/**
 * Kênh bán hàng > Website: chủ cửa hàng sửa thông tin chung hiển thị trên website bán hàng
 * (thanh thông báo trên cùng, footer: giới thiệu, Về THORS, liên hệ). Bên dưới có bản xem trước.
 */

// Các ô nhập, chia theo nhóm
const SECTIONS = [
  {
    title: 'Thanh thông báo',
    desc: 'Dòng chữ trên nền đen ở đầu mọi trang. Để trống thì ẩn thanh này.',
    fields: [{ key: 'announcement', label: 'Nội dung thông báo' }]
  },
  {
    title: 'Giới thiệu',
    desc: 'Hiển thị ở chân trang (footer).',
    fields: [
      { key: 'tagline', label: 'Câu giới thiệu dưới logo', multiline: true, rows: 2 },
      {
        key: 'about',
        label: `Cột "Về ${STORE_NAME}"`,
        multiline: true,
        rows: 4,
        helper: 'Mỗi dòng là một ý. Để trống thì ẩn cột này.'
      }
    ]
  },
  {
    title: 'Liên hệ',
    desc: 'Để trống thì website ghi "Đang cập nhật" (email để trống thì ẩn).',
    fields: [
      { key: 'hotline', label: 'Hotline', half: true, autoComplete: 'tel', inputMode: 'numeric', helper: 'Nhập đủ 10 chữ số, rời khỏi ô sẽ tự hiển thị dạng xxxx.xxx.xxx.' },
      { key: 'email', label: 'Email', half: true, type: 'email', autoComplete: 'email' }
    ],
    address: true
  },
  {
    title: 'Cuối trang',
    desc: 'Dòng chữ nhỏ ở góc phải, dưới cùng của footer.',
    fields: [{ key: 'closingNote', label: 'Lời nhắn cuối trang' }]
  }
];

// Giữ nguyên props của Autocomplete, chỉ thêm nhãn cho trình đọc màn hình
const withAriaLabel = (slotProps = {}, label) => ({
  ...slotProps,
  htmlInput: { ...slotProps.htmlInput, 'aria-label': label }
});

const norm = (text) => String(text || '').normalize('NFC').trim().toLowerCase();

/**
 * Tách "12 Nguyễn Trãi, Phường Ba Đình, Thành phố Hà Nội" thành số nhà + mã phường/xã + mã tỉnh/thành.
 * Không khớp được danh sách thì đưa cả chuỗi vào ô số nhà để chọn lại.
 */
async function splitAddress(address) {
  const parts = address.split(',').map((x) => x.trim()).filter(Boolean);
  const fallback = { addressDetail: address, provinceCode: '', wardCode: '' };
  if (parts.length < 3) return fallback;
  try {
    const province = (await fetchProvinces()).find((p) => norm(p.name) === norm(parts[parts.length - 1]));
    if (!province) return fallback;
    const ward = (await fetchWards(province.code)).find((w) => norm(w.name) === norm(parts[parts.length - 2]));
    if (!ward) return fallback;
    return { addressDetail: parts.slice(0, -2).join(', '), provinceCode: province.code, wardCode: ward.code };
  } catch {
    return fallback;
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WebsiteSettingsPage() {
  useCrumbs(['Kênh bán hàng', 'Website']);
  const [toast, showToast] = useToast();
  const [saved, setSaved] = useState(null); // giá trị đang lưu trên server (đã gộp mặc định)
  const [values, setValues] = useState(WEBSITE_DEFAULTS);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getWebsiteSettings()
      .then(async (d) => {
        const next = withDefaults(d.settings || {});
        // Chưa có mã tỉnh/xã (lưu từ bản cũ) thì tách lại từ địa chỉ đã lưu để các ô hiện đúng lựa chọn
        if (next.address && !next.provinceCode) Object.assign(next, await splitAddress(next.address));
        setSaved(next);
        setValues(next);
      })
      .catch((e) => setLoadError(e.message || 'Không tải được thông tin website.'));
  }, []);

  const errors = useMemo(() => {
    const result = {};
    Object.entries(WEBSITE_LIMITS).forEach(([key, max]) => {
      if ((values[key] || '').trim().length > max) result[key] = `Tối đa ${max} ký tự.`;
    });
    if (values.email.trim() && !EMAIL_RE.test(values.email.trim())) result.email = 'Email không hợp lệ.';
    const hotlineDigits = values.hotline.replace(/\D/g, '');
    if (values.hotline && hotlineDigits.length !== 10) {
      result.hotline = `Vui lòng nhập đủ 10 chữ số (đang có ${hotlineDigits.length} số).`;
    }
    // Địa chỉ: để trống cả 3 ô, hoặc điền đủ cả 3
    const detail = values.addressDetail.trim();
    if (detail || values.provinceCode || values.wardCode) {
      if (!values.provinceCode) result.provinceCode = 'Vui lòng chọn Tỉnh/Thành phố.';
      if (!values.wardCode) result.wardCode = 'Vui lòng chọn Phường/Xã.';
      if (detail.length < 2) result.addressDetail = 'Vui lòng nhập số nhà, tên đường (ít nhất 2 ký tự).';
    }
    return result;
  }, [values]);

  // Danh sách Tỉnh/Thành phố và Phường/Xã (địa giới mới, 2 cấp) — dùng chung nguồn với form địa chỉ giao hàng
  const [provinces, setProvinces] = useState([]);
  const [wards, setWards] = useState([]);
  const [addressError, setAddressError] = useState('');
  useEffect(() => {
    fetchProvinces()
      .then(setProvinces)
      .catch(() => setAddressError('Không tải được danh sách Tỉnh/Thành phố.'));
  }, []);
  useEffect(() => {
    if (!values.provinceCode) return undefined;
    let alive = true;
    fetchWards(values.provinceCode)
      .then((list) => alive && setWards(list))
      .catch(() => alive && setAddressError('Không tải được danh sách Phường/Xã.'));
    return () => {
      alive = false;
    };
  }, [values.provinceCode]);
  const province = provinces.find((p) => p.code === values.provinceCode) || null;
  const ward = values.provinceCode ? wards.find((w) => w.code === values.wardCode) || null : null;
  // Địa chỉ hiển thị trên website: "số nhà, phường/xã, tỉnh/thành"
  const composedAddress = province && ward && values.addressDetail.trim() ? [values.addressDetail.trim(), ward.name, province.name].join(', ') : '';
  // Xem trước: đang chọn đủ thì hiện địa chỉ ghép; chưa đụng tới 3 ô địa chỉ thì hiện địa chỉ đã lưu
  const addressUntouched =
    saved && ['provinceCode', 'wardCode', 'addressDetail'].every((key) => (values[key] || '') === (saved[key] || ''));
  const previewAddress = composedAddress || (addressUntouched ? saved.address : '');

  const comparable = (key, value) => (key === 'hotline' && value ? formatHotline(value) : value || '');
  const changed = saved && Object.keys(WEBSITE_DEFAULTS).some((key) => comparable(key, values[key]) !== comparable(key, saved[key]));
  const valid = Object.keys(errors).length === 0;
  const set = (key) => (e) => {
    // Hotline: chỉ nhận chữ số, tối đa 10 số; đang gõ thì không chèn dấu chấm để con trỏ không nhảy
    const value = key === 'hotline' ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value;
    setValues((v) => ({ ...v, [key]: value }));
  };

  const save = async (e) => {
    e.preventDefault();
    if (!valid || !changed) return;
    setSaving(true);
    try {
      // Chỉ gửi những ô đã thay đổi — sửa mỗi Hotline thì chỉ Hotline được lưu, các ô khác giữ nguyên
      const all = Object.fromEntries(Object.keys(WEBSITE_DEFAULTS).map((key) => [key, (values[key] || '').trim()]));
      all.hotline = values.hotline ? formatHotline(values.hotline) : '';
      all.address = composedAddress || (addressUntouched ? saved.address || '' : '');
      const ADDRESS_KEYS = ['address', 'addressDetail', 'provinceCode', 'wardCode'];
      const body = Object.fromEntries(Object.entries(all).filter(([key]) => comparable(key, all[key]) !== comparable(key, saved[key])));
      if (ADDRESS_KEYS.some((key) => key in body)) ADDRESS_KEYS.forEach((key) => (body[key] = all[key]));
      const d = await saveWebsiteSettings(body);
      // Các ô giữ đúng nội dung vừa lưu
      const next = withDefaults({ ...saved, ...body, ...(d.settings || {}), ...body });
      setSaved(next);
      setValues(next);
      setWebsiteSettingsCache(next); // website cập nhật ngay, không cần tải lại
      showToast('Đã lưu thông tin website.');
    } catch (err) {
      showToast(err.message || 'Không lưu được, vui lòng thử lại.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const card = { ...cardSx, p: { xs: 2.5, md: 3.5 } };

  return (
    <Box>
      <PageHeader
        title="Website"
        subtitle="Thông tin chung hiển thị trên website bán hàng: thanh thông báo, giới thiệu, liên hệ ở chân trang."
        action={
          <OutlineButton component="a" href="/" target="_blank" rel="noopener" startIcon={<ExportOutlined />}>
            Xem website
          </OutlineButton>
        }
      />

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {!saved && !loadError ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        <Box component="form" onSubmit={save} noValidate sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <Box sx={card}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3.5 }}>
              {SECTIONS.map((section) => (
                <Box key={section.title}>
                  <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle }}>
                    {section.title}
                  </Typography>
                  <Typography sx={{ color: brand.muted, fontSize: fs.caption, mt: 0.25, mb: 2 }}>{section.desc}</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
                    {section.fields.map((f) => {
                      const length = (values[f.key] || '').length;
                      return (
                        <Box key={f.key} sx={{ gridColumn: f.half ? 'auto' : '1 / -1' }}>
                          <FormField
                            label={f.label}
                            error={errors[f.key]}
                            helper={f.key === 'hotline' ? f.helper : `${f.helper ? `${f.helper} ` : ''}${length}/${WEBSITE_LIMITS[f.key]} ký tự`}
                          >
                            <TextInput
                              label={f.label}
                              name={f.key}
                              type={f.type}
                              autoComplete={f.autoComplete}
                              placeholder={f.placeholder}
                              multiline={f.multiline}
                              minRows={f.rows}
                              value={values[f.key] || ''}
                              onChange={set(f.key)}
                              onFocus={f.key === 'hotline' ? () => setValues((v) => ({ ...v, hotline: v.hotline.replace(/\D/g, '') })) : undefined}
                              onBlur={f.key === 'hotline' ? () => setValues((v) => (v.hotline.length === 10 ? { ...v, hotline: formatHotline(v.hotline) } : v)) : undefined}
                              slotProps={f.inputMode ? { htmlInput: { 'aria-label': f.label, inputMode: f.inputMode, maxLength: 12 } } : undefined}
                              error={Boolean(errors[f.key])}
                              disabled={Boolean(loadError)}
                            />
                          </FormField>
                        </Box>
                      );
                    })}
                  </Box>
                  {section.address && (
                    <Box sx={{ mt: 2.5, display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
                      {addressError && (
                        <Alert severity="warning" sx={{ gridColumn: '1 / -1' }}>
                          {addressError}
                        </Alert>
                      )}
                      <FormField label="Tỉnh/Thành phố" error={errors.provinceCode}>
                        <Autocomplete
                          options={provinces}
                          value={province}
                          getOptionLabel={(o) => o.name}
                          isOptionEqualToValue={(a, b) => a.code === b.code}
                          noOptionsText="Không tìm thấy"
                          disabled={Boolean(loadError)}
                          onChange={(_, option) => {
                            setWards([]);
                            setValues((v) => ({ ...v, provinceCode: option?.code || '', wardCode: '' }));
                          }}
                          renderInput={(params) => (
                            <TextInput
                              {...params}
                              slotProps={withAriaLabel(params.slotProps, 'Tỉnh/Thành phố')}
                              placeholder="Gõ để tìm tỉnh/thành"
                              error={Boolean(errors.provinceCode)}
                            />
                          )}
                        />
                      </FormField>
                      <FormField label="Phường/Xã" error={errors.wardCode}>
                        <Autocomplete
                          options={wards}
                          value={ward}
                          getOptionLabel={(o) => o.name}
                          isOptionEqualToValue={(a, b) => a.code === b.code}
                          noOptionsText="Không tìm thấy"
                          disabled={Boolean(loadError) || !values.provinceCode}
                          onChange={(_, option) => setValues((v) => ({ ...v, wardCode: option?.code || '' }))}
                          renderInput={(params) => (
                            <TextInput
                              {...params}
                              slotProps={withAriaLabel(params.slotProps, 'Phường/Xã')}
                              placeholder={values.provinceCode ? 'Gõ để tìm phường/xã' : 'Chọn tỉnh/thành trước'}
                              error={Boolean(errors.wardCode)}
                            />
                          )}
                        />
                      </FormField>
                      <Box sx={{ gridColumn: '1 / -1' }}>
                        <FormField
                          label="Số nhà, tên đường"
                          error={errors.addressDetail}
                          helper={composedAddress ? `Hiển thị: ${composedAddress}` : 'Để trống cả 3 ô thì website ghi "Đang cập nhật".'}
                        >
                          <TextInput
                            label="Số nhà, tên đường"
                            name="addressDetail"
                            placeholder="Ví dụ: 12 Nguyễn Trãi"
                            value={values.addressDetail}
                            onChange={set('addressDetail')}
                            error={Boolean(errors.addressDetail)}
                            disabled={Boolean(loadError)}
                          />
                        </FormField>
                      </Box>
                    </Box>
                  )}
                </Box>
              ))}

              <NoticeBox title="Lưu xong có hiệu lực ngay" icon={<InfoCircleOutlined />}>
                Khách đang mở website sẽ thấy nội dung mới khi tải lại trang.
              </NoticeBox>

              <Box sx={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 1.5 }}>
                <OutlineButton type="button" onClick={() => setValues(WEBSITE_DEFAULTS)} disabled={Boolean(loadError) || saving}>
                  Dùng nội dung mặc định
                </OutlineButton>
                <OutlineButton type="button" onClick={() => saved && setValues(saved)} disabled={!changed || saving}>
                  Hủy thay đổi
                </OutlineButton>
                <BrandButton type="submit" disabled={!changed || !valid || saving || Boolean(loadError)} sx={{ fontSize: fs.body }}>
                  {saving ? 'Đang lưu…' : 'Lưu'}
                </BrandButton>
              </Box>
            </Box>
          </Box>

          {/* Xem trước: dùng đúng thanh thông báo và footer của website */}
          <Box sx={card}>
            <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle, mb: 2 }}>
              Xem trước
            </Typography>
            <Box sx={{ border: `1px solid ${brand.line}`, borderRadius: '12px', overflow: 'hidden', bgcolor: '#FFFFFF', fontFamily: SANS }}>
              <AnnouncementBar text={values.announcement.trim()} />
              <Box sx={{ py: 4, textAlign: 'center', color: brand.muted, fontSize: fs.caption }}>… nội dung trang …</Box>
              <StoreFooter settings={{ ...values, address: previewAddress }} />
            </Box>
          </Box>
        </Box>
      )}
      {toast}
    </Box>
  );
}

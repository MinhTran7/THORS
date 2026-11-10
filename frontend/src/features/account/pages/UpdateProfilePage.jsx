import { useEffect, useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import useSWR from 'swr';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { Stack } from '../components/Flex';
import { ArrowLeftOutlined, CloudUploadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { imageError } from 'services/imageUpload';
import { accountsApi } from '../api';
import { brand, cardSx, fs } from '../tokens';
import { fullName, phone } from '../validation';
import { BrandButton, OutlineButton } from '../components/Brand';
import { FormField, TextInput } from '../components/Form';
import { NoticeBox, PageHeader } from '../components/Blocks';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';
import { C } from 'features/shop/storeTheme';
import { StoreAccountShell, storeNoticeSx, storePanelSx, useIsCustomer } from '../components/StoreAccount';

const schema = Yup.object({ fullName, phone });

export default function UpdateProfilePage() {
  useCrumbs(['Hồ sơ', 'Cập nhật hồ sơ']);
  const { reload } = useAuth();
  const isCustomer = useIsCustomer();
  const { data, mutate } = useSWR('account-profile', accountsApi.profile, { revalidateOnFocus: false });
  const [toast, showToast] = useToast();
  const [error, setError] = useState('');
  // undefined = giữ ảnh hiện tại, '' = xóa ảnh khi Lưu, File = ảnh mới sẽ được đẩy lên khi Lưu
  const [photo, setPhoto] = useState(undefined);
  const [photoError, setPhotoError] = useState('');
  const inputRef = useRef(null);

  // Ảnh mới chỉ xem trước bằng URL tạm của trình duyệt, chưa gửi đi đâu cả.
  const preview = useMemo(() => (photo instanceof File ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  const avatar = photo === undefined ? data?.avatarUrl : photo === '' ? '' : preview;

  const form = useFormik({
    enableReinitialize: true,
    initialValues: { fullName: data?.fullName ?? '', phone: data?.phone ?? '' },
    validationSchema: schema,
    onSubmit: async (values) => {
      setError('');
      try {
        if (form.dirty) {
          await accountsApi.updateProfile({ fullName: values.fullName.trim(), phone: values.phone.trim() || undefined });
        }
        // Backend đẩy ảnh mới lên Cloudinary, lưu vào hồ sơ rồi xóa ảnh cũ.
        if (photo instanceof File) await accountsApi.replaceAvatar(photo);
        else if (photo === '') await accountsApi.removeAvatar();
        setPhoto(undefined);
        await Promise.all([mutate(), reload()]);
        showToast('Hồ sơ của bạn đã được cập nhật.');
      } catch (e) {
        // Thông tin đã lưu (nếu có) vẫn được tải lại; ảnh chưa lưu thì giữ để người dùng thử lại.
        await mutate();
        setError(e.message);
      }
    }
  });

  function pickFile(file) {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    const problem = imageError(file);
    setPhotoError(problem);
    if (!problem) setPhoto(file);
  }

  const changed = form.dirty || photo !== undefined;
  const saving = form.isSubmitting;
  const fieldError = (name) => (form.touched[name] && form.errors[name]) || '';

  const header = {
    back: { to: '/profile', label: 'Hồ sơ cá nhân' },
    title: 'Cập nhật hồ sơ',
    subtitle: 'Giữ thông tin luôn mới để chúng tôi có thể liên lạc với bạn.'
  };
  // Khách hàng: khung cửa hàng (khung vuông, nút đen); các vai trò khác giữ giao diện quản trị
  const card = isCustomer ? storePanelSx : cardSx;
  const Shell = isCustomer ? StoreAccountShell : Box;
  const shellProps = isCustomer ? header : {};

  return (
    <Shell {...shellProps}>
      {!isCustomer && <PageHeader {...header} />}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 380px' }, gap: 3, alignItems: 'start' }}>
        <Box component="form" onSubmit={form.handleSubmit} noValidate sx={{ ...card, p: 3.5 }}>
          <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle }}>
            Thông tin chi tiết
          </Typography>
          <Typography sx={{ color: brand.muted, fontSize: fs.caption, mt: 0.25 }}>
            Thông tin của bạn chỉ hiển thị với người quản lý tài khoản có thẩm quyền.
          </Typography>
          <Stack spacing={2.5} sx={{ mt: 2.5 }}>
            <FormField label="Họ và tên" error={fieldError('fullName')}>
              <TextInput
                label="Họ và tên"
                name="fullName"
                value={form.values.fullName}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
                error={Boolean(fieldError('fullName'))}
              />
            </FormField>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
              <FormField label="Số điện thoại" error={fieldError('phone')}>
                <TextInput
                  label="Số điện thoại"
                  name="phone"
                  autoComplete="tel"
                  value={form.values.phone}
                  onChange={form.handleChange}
                  onBlur={form.handleBlur}
                  error={Boolean(fieldError('phone'))}
                />
              </FormField>
              <FormField label="Email">
                <TextInput label="Email" value={data?.email ?? ''} disabled />
              </FormField>
            </Box>
            <NoticeBox title="Thay đổi thông tin liên hệ?" icon={<InfoCircleOutlined />} sx={isCustomer ? storeNoticeSx : undefined}>
              Email là tên đăng nhập của bạn nên không thể đổi tại đây. Số điện thoại mới có hiệu lực ngay sau khi bạn lưu.
            </NoticeBox>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" alignItems={{ sm: 'center' }} spacing={1.5}>
              <BrandButton type="submit" disabled={!changed || saving} sx={{ fontSize: fs.body }}>
                {saving ? 'Đang lưu…' : 'Lưu'}
              </BrandButton>
            </Stack>
          </Stack>
        </Box>

        <Box>
          <Box sx={{ ...card, p: 3.5 }}>
            <Typography variant="h5" sx={{ color: brand.ink, mb: 2, fontSize: fs.cardTitle }}>
              Ảnh đại diện
            </Typography>
            <Stack alignItems="center" spacing={0.75}>
              <UserAvatar name={form.values.fullName || data?.fullName} src={avatar} size={110} />
              <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>
                {photo === undefined ? 'Ảnh hiện tại' : photo === '' ? 'Ảnh sẽ bị xóa' : 'Ảnh mới (lưu để áp dụng)'}
              </Typography>
            </Stack>
            <Box
              component="label"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (!saving) pickFile(event.dataTransfer.files?.[0]);
              }}
              sx={{
                mt: 2.5,
                p: 3,
                display: 'block',
                textAlign: 'center',
                border: `1.5px dashed ${isCustomer ? C.ink : brand.cyan}`,
                borderRadius: isCustomer ? 0 : '12px',
                bgcolor: isCustomer ? C.sand : '#F4FCFD',
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1
              }}
            >
              <input
                ref={inputRef}
                type="file"
                hidden
                accept="image/png,image/jpeg"
                disabled={saving}
                onChange={(event) => pickFile(event.target.files?.[0])}
              />
              {saving && photo instanceof File ? <CircularProgress size={22} /> : <CloudUploadOutlined style={{ fontSize: 24 }} />}
              <Typography variant="subtitle2" sx={{ color: brand.ink, mt: 0.5, fontSize: fs.body }}>
                {saving && photo instanceof File ? 'Đang tải lên…' : 'Chọn ảnh mới'}
              </Typography>
              <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>JPG hoặc PNG · tối đa 5 MB</Typography>
            </Box>
            {photoError && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {photoError}
              </Alert>
            )}
            <OutlineButton
              fullWidth
              sx={{ mt: 1.5, fontSize: fs.body }}
              disabled={!avatar || saving}
              onClick={() => {
                setPhotoError('');
                // Đánh dấu xóa ảnh khi Lưu; chưa có ảnh đã lưu thì chỉ cần bỏ ảnh vừa chọn.
                setPhoto(data?.avatarUrl ? '' : undefined);
              }}
            >
              Xóa ảnh
            </OutlineButton>
          </Box>
          <Typography sx={{ color: brand.muted, display: 'block', mt: 1.5, fontSize: fs.caption }}>
            Hãy chọn ảnh vuông, rõ nét. Ảnh sẽ hiển thị trong hồ sơ và thanh điều hướng của bạn.
          </Typography>
        </Box>
      </Box>
      {/* Khách đã có link quay lại ở đầu trang */}
      {!isCustomer && (
        <OutlineButton component={RouterLink} to="/profile" startIcon={<ArrowLeftOutlined />} sx={{ mt: 4, fontSize: fs.body }}>
          Quay lại hồ sơ
        </OutlineButton>
      )}
      {toast}
    </Shell>
  );
}

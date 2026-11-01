import { useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import useSWR from 'swr';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Alert, Box, CircularProgress, Typography } from '@mui/material';
import { Stack } from '../components/Flex';
import { ArrowLeftOutlined, CloudUploadOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { imageUploadEnabled, uploadImage } from 'services/imageUpload';
import { accountsApi } from '../api';
import { brand, cardSx, fs } from '../tokens';
import { fullName, phone } from '../validation';
import { BrandButton, OutlineButton } from '../components/Brand';
import { FormField, TextInput } from '../components/Form';
import { NoticeBox, PageHeader } from '../components/Blocks';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';

const schema = Yup.object({ fullName, phone });

export default function UpdateProfilePage() {
  useCrumbs(['Hồ sơ', 'Cập nhật hồ sơ']);
  const { reload } = useAuth();
  const { data, mutate } = useSWR('account-profile', accountsApi.profile, { revalidateOnFocus: false });
  const [toast, showToast] = useToast();
  const [error, setError] = useState('');
  // undefined = giữ ảnh hiện tại, '' = xóa ảnh, chuỗi khác = ảnh mới vừa tải lên
  const [photo, setPhoto] = useState(undefined);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const inputRef = useRef(null);

  const avatar = photo === undefined ? data?.avatarUrl : photo;

  const form = useFormik({
    enableReinitialize: true,
    initialValues: { fullName: data?.fullName ?? '', phone: data?.phone ?? '' },
    validationSchema: schema,
    onSubmit: async (values) => {
      setError('');
      try {
        await accountsApi.updateProfile({
          fullName: values.fullName.trim(),
          phone: values.phone.trim() || undefined,
          avatarUrl: photo === undefined ? (data?.avatarUrl ?? '') : photo
        });
        await Promise.all([mutate(), reload()]);
        setPhoto(undefined);
        showToast('Hồ sơ của bạn đã được cập nhật.');
      } catch (e) {
        setError(e.message);
      }
    }
  });

  async function pickFile(file) {
    if (!file) return;
    setPhotoError('');
    setUploading(true);
    try {
      setPhoto(await uploadImage(file));
    } catch (e) {
      setPhotoError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  const changed = form.dirty || photo !== undefined;
  const fieldError = (name) => (form.touched[name] && form.errors[name]) || '';

  return (
    <Box>
      <PageHeader
        back={{ to: '/profile', label: 'Hồ sơ cá nhân' }}
        title="Cập nhật hồ sơ"
        subtitle="Giữ thông tin luôn mới để chúng tôi có thể liên lạc với bạn."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 380px' }, gap: 3, alignItems: 'start' }}>
        <Box component="form" onSubmit={form.handleSubmit} noValidate sx={{ ...cardSx, p: 3.5 }}>
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
            <NoticeBox title="Thay đổi thông tin liên hệ?" icon={<InfoCircleOutlined />}>
              Email là tên đăng nhập của bạn nên không thể đổi tại đây. Số điện thoại mới có hiệu lực ngay sau khi bạn lưu.
            </NoticeBox>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" alignItems={{ sm: 'center' }} spacing={1.5}>
              <BrandButton type="submit" disabled={!changed || form.isSubmitting || uploading} sx={{ fontSize: fs.body }}>
                {form.isSubmitting ? 'Đang lưu…' : 'Lưu'}
              </BrandButton>
            </Stack>
          </Stack>
        </Box>

        <Box>
          <Box sx={{ ...cardSx, p: 3.5 }}>
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
                if (imageUploadEnabled) pickFile(event.dataTransfer.files?.[0]);
              }}
              sx={{
                mt: 2.5,
                p: 3,
                display: 'block',
                textAlign: 'center',
                border: `1.5px dashed ${brand.cyan}`,
                borderRadius: '12px',
                bgcolor: '#F4FCFD',
                cursor: imageUploadEnabled ? 'pointer' : 'not-allowed',
                opacity: imageUploadEnabled ? 1 : 0.6
              }}
            >
              <input
                ref={inputRef}
                type="file"
                hidden
                accept="image/png,image/jpeg"
                disabled={!imageUploadEnabled || uploading}
                onChange={(event) => pickFile(event.target.files?.[0])}
              />
              {uploading ? <CircularProgress size={22} /> : <CloudUploadOutlined style={{ fontSize: 24 }} />}
              <Typography variant="subtitle2" sx={{ color: brand.ink, mt: 0.5, fontSize: fs.body }}>
                {uploading ? 'Đang tải lên…' : 'Tải ảnh mới lên'}
              </Typography>
              <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>
                {imageUploadEnabled ? 'JPG hoặc PNG · tối đa 5 MB' : 'Chức năng tải ảnh chưa được cấu hình.'}
              </Typography>
            </Box>
            {photoError && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {photoError}
              </Alert>
            )}
            <OutlineButton fullWidth sx={{ mt: 1.5, fontSize: fs.body }} disabled={!avatar || uploading} onClick={() => setPhoto('')}>
              Xóa ảnh
            </OutlineButton>
          </Box>
          <Typography sx={{ color: brand.muted, display: 'block', mt: 1.5, fontSize: fs.caption }}>
            Hãy chọn ảnh vuông, rõ nét. Ảnh sẽ hiển thị trong hồ sơ và thanh điều hướng của bạn.
          </Typography>
        </Box>
      </Box>
      <OutlineButton component={RouterLink} to="/profile" startIcon={<ArrowLeftOutlined />} sx={{ mt: 4, fontSize: fs.body }}>
        Quay lại hồ sơ
      </OutlineButton>
      {toast}
    </Box>
  );
}
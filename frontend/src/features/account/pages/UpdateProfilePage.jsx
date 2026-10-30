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
import { brand, cardSx } from '../tokens';
import { fullName, phone } from '../validation';
import { BrandButton, OutlineButton } from '../components/Brand';
import { FormField, TextInput } from '../components/Form';
import { NoticeBox, PageHeader } from '../components/Blocks';
import { useToast } from '../components/Toast';
import UserAvatar from '../components/UserAvatar';

const schema = Yup.object({ fullName, phone });

export default function UpdateProfilePage() {
  useCrumbs(['Profile', 'Update Profile']);
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
        showToast('Your profile has been updated.');
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
        back={{ to: '/profile', label: 'User Profile' }}
        title="Update Profile"
        subtitle="Keep your details current so we can stay in touch."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 340px' }, gap: 3, alignItems: 'start' }}>
        <Box component="form" onSubmit={form.handleSubmit} noValidate sx={{ ...cardSx, p: 3 }}>
          <Typography variant="h5" sx={{ color: brand.ink }}>
            Personal details
          </Typography>
          <Typography variant="caption" sx={{ color: brand.muted }}>
            Your information is only visible to authorized account managers.
          </Typography>
          <Stack spacing={2.5} sx={{ mt: 2.5 }}>
            <FormField label="Name" error={fieldError('fullName')}>
              <TextInput
                label="Name"
                name="fullName"
                value={form.values.fullName}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
                error={Boolean(fieldError('fullName'))}
              />
            </FormField>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
              <FormField label="Phone" error={fieldError('phone')}>
                <TextInput
                  label="Phone"
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
            <NoticeBox title="Changing your contact details?" icon={<InfoCircleOutlined />}>
              Your email is your sign-in, so it can&apos;t be changed here. A new phone number takes effect as soon as you save.
            </NoticeBox>
            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={1.5}>
              <Typography variant="caption" sx={{ color: brand.muted }}>
                Your role and store permissions won&apos;t change.
              </Typography>
              <BrandButton type="submit" disabled={!changed || form.isSubmitting || uploading}>
                {form.isSubmitting ? 'Saving…' : 'Save'}
              </BrandButton>
            </Stack>
          </Stack>
        </Box>

        <Box>
          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, mb: 2 }}>
              Profile photo
            </Typography>
            <Stack alignItems="center" spacing={0.75}>
              <UserAvatar name={form.values.fullName || data?.fullName} src={avatar} size={110} />
              <Typography variant="caption" sx={{ color: brand.muted }}>
                {photo === undefined ? 'Current avatar' : photo === '' ? 'Photo will be removed' : 'New photo (save to apply)'}
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
              {uploading ? <CircularProgress size={22} /> : <CloudUploadOutlined style={{ fontSize: 22 }} />}
              <Typography variant="subtitle2" sx={{ color: brand.ink, mt: 0.5 }}>
                {uploading ? 'Uploading…' : 'Upload a new photo'}
              </Typography>
              <Typography variant="caption" sx={{ color: brand.muted }}>
                {imageUploadEnabled ? 'JPG or PNG · up to 5 MB' : 'Photo upload is not configured yet.'}
              </Typography>
            </Box>
            {photoError && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {photoError}
              </Alert>
            )}
            <OutlineButton fullWidth sx={{ mt: 1.5 }} disabled={!avatar || uploading} onClick={() => setPhoto('')}>
              Remove photo
            </OutlineButton>
          </Box>
          <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 1.5 }}>
            Choose a clear, square image. Your photo appears in your profile and workspace navigation.
          </Typography>
        </Box>
      </Box>
      <OutlineButton component={RouterLink} to="/profile" startIcon={<ArrowLeftOutlined />} sx={{ mt: 4 }}>
        Back to Profile
      </OutlineButton>
      {toast}
    </Box>
  );
}
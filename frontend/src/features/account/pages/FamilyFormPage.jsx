import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Alert, Box, Typography } from '@mui/material';
import { Stack } from '../components/Flex';
import { InfoCircleOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { accountsApi } from '../api';
import { brand, cardSx } from '../tokens';
import { fullName, newPassword, phone } from '../validation';
import { BrandButton, BrandSwitch, OutlineButton } from '../components/Brand';
import { RoleChip } from '../components/Chips';
import { NoticeBox, PageHeader } from '../components/Blocks';
import { FormField, PasswordInput, TextInput } from '../components/Form';

// Chỉ còn tài khoản Family member nên role luôn cố định.
const FAMILY_ROLE = 'FAMILY_MEMBER';

const createSchema = Yup.object({
  fullName,
  email: Yup.string().trim().required('Vui lòng nhập địa chỉ email.').email('Địa chỉ email không hợp lệ.'),
  phone: phone.required('Vui lòng nhập số điện thoại.'),
  password: newPassword
});
const editSchema = Yup.object({ fullName });

// Tạo mới: /family/new. Chỉnh sửa: /family/:id/edit (backend chỉ cho sửa tên).
export default function FamilyFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  useCrumbs(['Gia đình', editing ? 'Sửa thành viên gia đình' : 'Thêm thành viên gia đình']);
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const { data } = useSWR(editing ? ['account', id] : null, () => accountsApi.detail(id), { revalidateOnFocus: false });

  const form = useFormik({
    enableReinitialize: true,
    initialValues: editing
      ? {
          fullName: data?.fullName ?? '',
          email: data?.email ?? '',
          phone: data?.phone ?? '',
          password: '',
          activate: true
        }
      : { fullName: '', email: '', phone: '', password: '', activate: true },
    validationSchema: editing ? editSchema : createSchema,
    onSubmit: async (values) => {
      setError('');
      try {
        if (editing) {
          await accountsApi.rename(id, values.fullName.trim());
          navigate(`/family/${id}`, { state: { toast: 'Đã cập nhật tài khoản.' } });
          return;
        }
        const created = await accountsApi.create({
          role: FAMILY_ROLE,
          fullName: values.fullName.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          password: values.password,
          confirmPassword: values.password
        });
        if (!values.activate) await accountsApi.setStatus(created.id, 'DISABLED');
        navigate('/family', { state: { toast: `Đã tạo tài khoản cho ${created.fullName}.` } });
      } catch (e) {
        setError(e.message);
      }
    }
  });
  const fieldError = (name) => (form.touched[name] && form.errors[name]) || '';
  const bind = (name) => ({
    name,
    value: form.values[name],
    onChange: form.handleChange,
    onBlur: form.handleBlur,
    error: Boolean(fieldError(name))
  });

  return (
    <Box>
      <PageHeader
        back={{
          to: editing ? `/family/${id}` : '/family',
          label: editing ? 'Chi tiết thành viên gia đình' : 'Danh sách gia đình / Thành viên mới'
        }}
        title={editing ? 'Sửa thành viên gia đình' : 'Biểu mẫu thành viên gia đình'}
        subtitle={editing ? 'Cập nhật tên hiển thị của tài khoản này.' : 'Tạo tài khoản an toàn cho thành viên gia đình.'}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
        <Box component="form" onSubmit={form.handleSubmit} noValidate sx={{ ...cardSx, p: 3 }}>
          <Typography variant="h5" sx={{ color: brand.ink }}>
            Thông tin tài khoản
          </Typography>
          <Typography variant="caption" sx={{ color: brand.muted }}>
            {editing
              ? 'Không thể thay đổi email và số điện thoại tại đây.'
              : 'Tất cả các trường đều bắt buộc. Mỗi người có một tài khoản đăng nhập riêng.'}
          </Typography>
          <Stack spacing={2.5} sx={{ mt: 2.5 }}>
            <FormField label="Tên" error={fieldError('fullName')}>
              <TextInput label="Tên" placeholder="Nhập họ và tên" {...bind('fullName')} />
            </FormField>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
              <FormField label="Email" error={fieldError('email')}>
                <TextInput label="Email" placeholder="name@example.com" autoComplete="off" disabled={editing} {...bind('email')} />
              </FormField>
              <FormField label="Số điện thoại" error={fieldError('phone')}>
                <TextInput
                  label="Số điện thoại"
                  placeholder="0912 345 678"
                  autoComplete="off"
                  disabled={editing}
                  {...bind('phone')}
                />
              </FormField>
            </Box>
            {!editing && (
              <FormField
                label="Mật khẩu"
                error={fieldError('password')}
                helper="Tối thiểu 10 ký tự. Người dùng nên đổi mật khẩu sau lần đăng nhập đầu tiên."
              >
                <PasswordInput
                  label="Mật khẩu"
                  placeholder="Tạo mật khẩu tạm thời"
                  autoComplete="new-password"
                  {...bind('password')}
                />
              </FormField>
            )}
            {!editing && (
              <Stack
                direction="row"
                justifyContent="space-between"
                alignItems="center"
                spacing={2}
                sx={{ bgcolor: '#F7F8F4', borderRadius: '12px', p: 2 }}
              >
                <Box>
                  <Typography variant="subtitle2" sx={{ color: brand.ink }}>
                    Kích hoạt tài khoản ngay
                  </Typography>
                  <Typography variant="caption" sx={{ color: brand.muted }}>
                    Người dùng có thể đăng nhập ngay khi tài khoản được tạo.
                  </Typography>
                </Box>
                <BrandSwitch
                  checked={form.values.activate}
                  onChange={(event) => form.setFieldValue('activate', event.target.checked)}
                  slotProps={{ input: { 'aria-label': 'Kích hoạt tài khoản ngay' } }}
                />
              </Stack>
            )}
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <OutlineButton component={RouterLink} to={editing ? `/family/${id}` : '/family'}>
                Hủy
              </OutlineButton>
              <BrandButton type="submit" disabled={form.isSubmitting || (editing && !data)}>
                {form.isSubmitting ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}
              </BrandButton>
            </Stack>
          </Stack>
        </Box>

        <Stack spacing={2.5}>
          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, mb: 2 }}>
              Quyền truy cập của thành viên gia đình
            </Typography>
            <RoleChip role={FAMILY_ROLE} />
            <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 0.75 }}>
              Dành cho các thành viên gia đình đáng tin cậy. Tài khoản gia đình chỉ có quyền xem thông tin cửa hàng.
            </Typography>
          </Box>
          <NoticeBox title="Cửa hàng của bạn, quyền của bạn" icon={<InfoCircleOutlined />}>
            Chỉ Chủ cửa hàng mới có thể thêm tài khoản hoặc kích hoạt, vô hiệu hóa quyền truy cập.
          </NoticeBox>
          <NoticeBox title="Khởi đầu an toàn" icon={<InfoCircleOutlined />}>
            Hãy gửi thông tin đăng nhập tạm thời qua kênh riêng tư. Yêu cầu thành viên mới đổi mật khẩu sau khi đăng nhập.
          </NoticeBox>
        </Stack>
      </Box>
    </Box>
  );
}
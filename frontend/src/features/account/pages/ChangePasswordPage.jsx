import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Alert, Box, Typography } from '@mui/material';
import { Stack } from '../components/Flex';
import { CheckCircleFilled, SafetyCertificateOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { useCrumbs } from 'layouts/crumbs';
import { clearCsrf } from 'services/http';
import { isLowercaseChar, isNumber, isSpecialChar, isUppercaseChar } from 'utils/password-validation';
import { accountsApi } from '../api';
import { brand, cardSx, fs } from '../tokens';
import { confirmPassword, newPassword } from '../validation';
import { BrandButton, OutlineButton } from '../components/Brand';
import { FormField, PasswordInput } from '../components/Form';
import { NoticeBox, PageHeader } from '../components/Blocks';
import { C } from 'features/shop/storeTheme';
import { StoreAccountShell, storeNoticeSx, storePanelSx } from '../components/StoreAccount';

const schema = Yup.object({
  currentPassword: Yup.string().required('Nhập mật khẩu hiện tại của bạn.'),
  password: newPassword,
  confirmPassword
});

function requirementsFor(value) {
  return [
    { label: 'Ít nhất 10 ký tự', ok: value.length >= 10 },
    { label: 'Có chữ hoa và chữ thường', ok: isUppercaseChar(value) && isLowercaseChar(value) },
    { label: 'Có một chữ số', ok: isNumber(value) },
    { label: 'Có một ký tự đặc biệt', ok: isSpecialChar(value) }
  ];
}

export default function ChangePasswordPage() {
  useCrumbs(['Hồ sơ', 'Đổi mật khẩu']);
  const { account, setAccount } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  // Shop Owner có thêm lựa chọn nhờ Admin đặt lại mật khẩu
  const [request, setRequest] = useState({ status: 'idle', message: '' });

  const form = useFormik({
    initialValues: { currentPassword: '', password: '', confirmPassword: '' },
    validationSchema: schema,
    onSubmit: async (values) => {
      setError('');
      try {
        await accountsApi.changePassword(values);
        setAccount(null);
        clearCsrf();
        navigate(`/login?message=${encodeURIComponent('Mật khẩu đã được cập nhật. Vui lòng đăng nhập lại.')}`);
      } catch (e) {
        setError(e.message);
      }
    }
  });

  async function sendResetRequest() {
    setRequest({ status: 'sending', message: '' });
    try {
      const result = await accountsApi.requestReset(account.email);
      setRequest({ status: 'sent', message: result.message });
    } catch (e) {
      setRequest({ status: 'error', message: e.message });
    }
  }

  const requirements = requirementsFor(form.values.password);
  const met = requirements.filter((item) => item.ok).length;
  const strengthLabel = !form.values.password ? ' ' : met === 4 ? 'Mật khẩu mạnh' : met === 3 ? 'Mật khẩu khá' : 'Mật khẩu yếu';
  const fieldError = (name) => (form.touched[name] && form.errors[name]) || '';
  const matches = form.values.confirmPassword && form.values.confirmPassword === form.values.password;

  // Khách hàng: khung cửa hàng (khung vuông, nút đen); các vai trò khác giữ giao diện quản trị
  const isCustomer = account.role === 'CUSTOMER';
  const card = isCustomer ? storePanelSx : cardSx;
  const accent = isCustomer ? C.ink : brand.cyan;
  const Shell = isCustomer ? StoreAccountShell : Box;
  const header = { back: { to: '/profile', label: 'Hồ sơ cá nhân' }, title: 'Đổi mật khẩu' };

  if (!account.passwordEnabled) {
    return (
      <Shell {...(isCustomer ? header : {})}>
        {!isCustomer && <PageHeader {...header} />}
        <Alert severity="info">Tài khoản này đăng nhập bằng Google nên không có mật khẩu THORS để đổi.</Alert>
      </Shell>
    );
  }

  const fullHeader = { ...header, subtitle: 'Mật khẩu mạnh giúp giữ tài khoản của bạn an toàn.' };

  return (
    <Shell {...(isCustomer ? fullHeader : {})}>
      {!isCustomer && <PageHeader {...fullHeader} />}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 360px' }, gap: 3, alignItems: 'start' }}>
        <Box component="form" onSubmit={form.handleSubmit} noValidate sx={{ ...card, p: 3.5 }}>
          <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle }}>
            Cập nhật mật khẩu
          </Typography>
          <Typography sx={{ color: brand.muted, fontSize: fs.caption, mt: 0.25 }}>
            {`Cho ${account.fullName} · ${account.email}`}
          </Typography>
          <Stack spacing={2.5} sx={{ mt: 2.5 }}>
            <FormField label="Mật khẩu hiện tại" error={fieldError('currentPassword')}>
              <PasswordInput
                label="Mật khẩu hiện tại"
                name="currentPassword"
                autoComplete="current-password"
                value={form.values.currentPassword}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
                error={Boolean(fieldError('currentPassword'))}
              />
            </FormField>
            <Box>
              <FormField label="Mật khẩu mới" error={fieldError('password')}>
                <PasswordInput
                  label="Mật khẩu mới"
                  name="password"
                  autoComplete="new-password"
                  value={form.values.password}
                  onChange={form.handleChange}
                  onBlur={form.handleBlur}
                  error={Boolean(fieldError('password'))}
                />
              </FormField>
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, mt: 1.25 }} aria-hidden>
                {[0, 1, 2, 3].map((index) => (
                  <Box key={index} sx={{ height: 4, borderRadius: isCustomer ? 0 : 2, bgcolor: index < met ? accent : brand.neutralBg }} />
                ))}
              </Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                <Typography sx={{ color: brand.ink, fontWeight: 600, fontSize: fs.caption }}>{strengthLabel}</Typography>
                <Typography sx={{ color: brand.muted, fontSize: fs.caption }}>
                  {met === 4 ? 'Đã đạt đủ yêu cầu' : form.values.password ? `Đạt ${met}/4 yêu cầu` : ''}
                </Typography>
              </Stack>
            </Box>
            <FormField
              label="Xác nhận mật khẩu"
              error={fieldError('confirmPassword')}
              helper={matches ? 'Hai mật khẩu mới trùng khớp.' : undefined}
            >
              <PasswordInput
                label="Xác nhận mật khẩu"
                name="confirmPassword"
                autoComplete="new-password"
                value={form.values.confirmPassword}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
                error={Boolean(fieldError('confirmPassword'))}
              />
            </FormField>
            <NoticeBox title="Bạn sẽ cần đăng nhập lại" icon={<InfoCircleOutlined />} sx={isCustomer ? storeNoticeSx : undefined}>
              Đổi mật khẩu sẽ đăng xuất bạn khỏi các thiết bị khác. Hãy dùng mật khẩu mới ở lần đăng nhập tiếp theo.
            </NoticeBox>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <OutlineButton component={RouterLink} to="/profile" sx={{ fontSize: fs.body }}>
                Hủy
              </OutlineButton>
              <BrandButton type="submit" disabled={form.isSubmitting} sx={{ fontSize: fs.body }}>
                {form.isSubmitting ? 'Đang cập nhật…' : 'Cập nhật'}
              </BrandButton>
            </Stack>
          </Stack>
        </Box>

        <Stack spacing={2.5}>
          <Box sx={{ ...card, p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle }}>
                Hãy chọn mật khẩu mạnh
              </Typography>
              <SafetyCertificateOutlined style={{ fontSize: 24 }} />
            </Stack>
            <Stack spacing={1} sx={{ mt: 1.5 }} component="ul" style={{ listStyle: 'none', margin: 0, padding: 0, marginTop: 12 }}>
              {requirements.map((item) => (
                <Stack key={item.label} component="li" direction="row" spacing={1} alignItems="center">
                  <CheckCircleFilled style={{ color: item.ok ? (isCustomer ? C.ink : '#2BB5C4') : '#D5D7D0', fontSize: 16 }} />
                  <Typography sx={{ color: brand.ink, fontSize: fs.body }}>{item.label}</Typography>
                </Stack>
              ))}
            </Stack>
            <Typography sx={{ color: brand.muted, display: 'block', mt: 1.5, fontSize: fs.caption }}>
              Chỉ quy tắc đầu tiên là bắt buộc; các quy tắc còn lại giúp mật khẩu mạnh hơn.
            </Typography>
          </Box>
          {account.role === 'OWNER' && (
            <Box sx={{ ...cardSx, p: 3 }}>
              <Typography variant="subtitle2" sx={{ color: brand.ink, fontSize: fs.strong }}>
                Nhờ quản trị viên đặt lại mật khẩu
              </Typography>
              <Typography sx={{ color: brand.muted, display: 'block', mt: 0.5, mb: 1.5, fontSize: fs.caption, lineHeight: 1.55 }}>
                Quản trị viên sẽ đặt mật khẩu mới và gửi riêng cho bạn. Bạn sẽ bị đăng xuất và đăng nhập lại bằng mật khẩu mới.
              </Typography>
              {request.status === 'sent' && (
                <Alert severity="success" sx={{ mb: 1.5 }}>
                  {request.message}
                </Alert>
              )}
              {request.status === 'error' && (
                <Alert severity="error" sx={{ mb: 1.5 }}>
                  {request.message}
                </Alert>
              )}
              <OutlineButton
                fullWidth
                onClick={sendResetRequest}
                disabled={request.status === 'sending' || request.status === 'sent'}
                sx={{ fontSize: fs.body }}
              >
                {request.status === 'sending' ? 'Đang gửi…' : request.status === 'sent' ? 'Đã gửi yêu cầu' : 'Gửi yêu cầu cho Admin'}
              </OutlineButton>
            </Box>
          )}
        </Stack>
      </Box>
    </Shell>
  );
}

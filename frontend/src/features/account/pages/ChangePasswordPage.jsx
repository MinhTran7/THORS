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
import { brand, cardSx } from '../tokens';
import { confirmPassword, newPassword } from '../validation';
import { BrandButton, OutlineButton } from '../components/Brand';
import { FormField, PasswordInput } from '../components/Form';
import { NoticeBox, PageHeader } from '../components/Blocks';

const schema = Yup.object({
  currentPassword: Yup.string().required('Enter your current password.'),
  password: newPassword,
  confirmPassword
});

function requirementsFor(value) {
  return [
    { label: 'At least 10 characters', ok: value.length >= 10 },
    { label: 'One uppercase and lowercase letter', ok: isUppercaseChar(value) && isLowercaseChar(value) },
    { label: 'One number', ok: isNumber(value) },
    { label: 'One special character', ok: isSpecialChar(value) }
  ];
}

export default function ChangePasswordPage() {
  useCrumbs(['Profile', 'Change Password']);
  const { account, setAccount } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  // Shop Owner quên mật khẩu hiện tại: gửi yêu cầu để Admin đặt lại
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
        navigate(`/login?message=${encodeURIComponent('Your password was updated. Please sign in again.')}`);
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
  const strengthLabel = !form.values.password ? ' ' : met === 4 ? 'Strong password' : met === 3 ? 'Good password' : 'Weak password';
  const fieldError = (name) => (form.touched[name] && form.errors[name]) || '';
  const matches = form.values.confirmPassword && form.values.confirmPassword === form.values.password;

  if (!account.passwordEnabled) {
    return (
      <Box>
        <PageHeader back={{ to: '/profile', label: 'User Profile' }} title="Change Password" />
        <Alert severity="info">This account signs in with Google, so it has no THORS password to change.</Alert>
      </Box>
    );
  }

  return (
    <Box>
      <PageHeader
        back={{ to: '/profile', label: 'User Profile' }}
        title="Change Password"
        subtitle="A strong password helps keep your account and store secure."
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
        <Box component="form" onSubmit={form.handleSubmit} noValidate sx={{ ...cardSx, p: 3 }}>
          <Typography variant="h5" sx={{ color: brand.ink }}>
            Update your password
          </Typography>
          <Typography variant="caption" sx={{ color: brand.muted }}>
            {`For ${account.fullName} · ${account.email}`}
          </Typography>
          <Stack spacing={2.5} sx={{ mt: 2.5 }}>
            <FormField label="Current Password" error={fieldError('currentPassword')}>
              <PasswordInput
                label="Current Password"
                name="currentPassword"
                autoComplete="current-password"
                value={form.values.currentPassword}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
                error={Boolean(fieldError('currentPassword'))}
              />
            </FormField>
            <Box>
              <FormField label="New Password" error={fieldError('password')}>
                <PasswordInput
                  label="New Password"
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
                  <Box key={index} sx={{ height: 4, borderRadius: 2, bgcolor: index < met ? brand.cyan : brand.neutralBg }} />
                ))}
              </Box>
              <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
                <Typography variant="caption" sx={{ color: brand.ink, fontWeight: 600 }}>
                  {strengthLabel}
                </Typography>
                <Typography variant="caption" sx={{ color: brand.muted }}>
                  {met === 4 ? 'All requirements met' : form.values.password ? `${met} of 4 requirements met` : ''}
                </Typography>
              </Stack>
            </Box>
            <FormField
              label="Confirm Password"
              error={fieldError('confirmPassword')}
              helper={matches ? 'Your new passwords match.' : undefined}
            >
              <PasswordInput
                label="Confirm Password"
                name="confirmPassword"
                autoComplete="new-password"
                value={form.values.confirmPassword}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
                error={Boolean(fieldError('confirmPassword'))}
              />
            </FormField>
            <NoticeBox title="You'll need to sign in again" icon={<InfoCircleOutlined />}>
              Updating your password signs you out of other devices. Use your new password the next time you log in.
            </NoticeBox>
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <OutlineButton component={RouterLink} to="/profile">
                Cancel
              </OutlineButton>
              <BrandButton type="submit" disabled={form.isSubmitting}>
                {form.isSubmitting ? 'Updating…' : 'Update'}
              </BrandButton>
            </Stack>
          </Stack>
        </Box>

        <Stack spacing={2.5}>
          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, mb: 1.5 }}>
              Make it a strong one
            </Typography>
            <SafetyCertificateOutlined style={{ fontSize: 24 }} />
            <Stack spacing={1} sx={{ mt: 1.5 }} component="ul" style={{ listStyle: 'none', margin: 0, padding: 0, marginTop: 12 }}>
              {requirements.map((item) => (
                <Stack key={item.label} component="li" direction="row" spacing={1} alignItems="center">
                  <CheckCircleFilled style={{ color: item.ok ? '#2BB5C4' : '#D5D7D0', fontSize: 14 }} />
                  <Typography variant="caption" sx={{ color: brand.ink }}>
                    {item.label}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 1.5 }}>
              Only the first rule is required; the others make your password stronger.
            </Typography>
          </Box>
          <NoticeBox title="A little extra protection">
            Choose a password you don&apos;t use elsewhere. Never share it with staff or family members, since each person should have their
            own account.
          </NoticeBox>
          {account.role === 'OWNER' ? (
            <Box sx={{ ...cardSx, p: 3 }}>
              <Typography variant="subtitle2" sx={{ color: brand.ink }}>
                Forgot your current password?
              </Typography>
              <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 0.5, mb: 1.5 }}>
                Ask the administrator to reset it. They will set a new password and share it with you privately. When they do, you will be
                signed out and can sign in with the new password.
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
              <OutlineButton fullWidth onClick={sendResetRequest} disabled={request.status === 'sending' || request.status === 'sent'}>
                {request.status === 'sending' ? 'Sending…' : request.status === 'sent' ? 'Request sent' : 'Send request to Admin'}
              </OutlineButton>
            </Box>
          ) : (
            <Typography variant="caption" sx={{ color: brand.muted }}>
              Forgot your current password? Use Forgot Password from the Login screen.
            </Typography>
          )}
        </Stack>
      </Box>
    </Box>
  );
}
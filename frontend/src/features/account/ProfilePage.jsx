import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Chip, Stack, Typography, Divider } from '@mui/material';
import * as Yup from 'yup';
import MainCard from 'components/MainCard';
import { useAuth } from 'features/auth/AuthProvider';
import { FieldsForm, Field } from 'features/auth/components/AuthForm';
import { useCapabilities } from 'features/auth/components/ChannelPicker';
import { password, confirmation } from 'features/auth/validation';
import { api, post, clearCsrf } from 'services/http';
export default function ProfilePage() {
  const { account, setAccount, reload } = useAuth();
  const capabilities = useCapabilities();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  async function action(fn) {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    }
  }
  const verify = (channel) =>
    action(async () => {
      await post('/auth/verify-contact', { channel });
      navigate('/auth/verify');
    });
  return (
    <Stack spacing={3} sx={{ maxWidth: 800 }}>
      <Typography variant="h3">Hồ sơ của tôi</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <MainCard title="Thông tin cá nhân">
        <Stack spacing={3}>
          <FieldsForm
            initialValues={{ fullName: account.fullName }}
            schema={Yup.object({ fullName: Yup.string().trim().required('Nhập họ tên.').max(100) })}
            submitLabel="Lưu thông tin"
            onSubmit={async (v) => {
              setAccount(await api('/accounts/profile', { method: 'PATCH', body: v }));
              return 'Đã cập nhật thông tin.';
            }}
          >
            {(form) => <Field form={form} name="fullName" label="Họ tên" />}
          </FieldsForm>
          <Divider />
          <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
            <Typography>{account.email}</Typography>
            <Chip
              size="small"
              color={account.emailVerified ? 'success' : 'warning'}
              label={account.emailVerified ? 'Đã xác minh' : 'Chưa xác minh'}
            />
            {!account.emailVerified && (
              <Button disabled={!capabilities?.email} onClick={() => verify('EMAIL')}>
                Xác minh email
              </Button>
            )}
          </Stack>
          {account.phone ? (
            <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
              <Typography>{account.phone}</Typography>
              <Chip
                size="small"
                color={account.phoneVerified ? 'success' : 'warning'}
                label={account.phoneVerified ? 'Đã xác minh' : 'Chưa xác minh'}
              />
              {!account.phoneVerified && (
                <Button disabled={!capabilities?.sms} onClick={() => verify('SMS')}>
                  Xác minh điện thoại
                </Button>
              )}
            </Stack>
          ) : (
            <FieldsForm
              initialValues={{ phone: '' }}
              schema={Yup.object({ phone: Yup.string().required('Nhập số điện thoại.') })}
              submitLabel="Bổ sung số điện thoại"
              onSubmit={async (v) => {
                await post('/accounts/profile/phone', v);
                await reload();
                return 'Đã bổ sung số điện thoại. Hãy xác minh bằng SMS.';
              }}
            >
              {(form) => <Field form={form} name="phone" label="Số điện thoại" autoComplete="tel" />}
            </FieldsForm>
          )}
        </Stack>
      </MainCard>
      <MainCard title="Liên kết Google">
        <Stack spacing={2}>
          <Typography>
            {account.googleLinked
              ? 'Đã liên kết Google. Bạn có thể đăng nhập trực tiếp bằng Google.'
              : 'Liên kết tài khoản Google có cùng email để đăng nhập nhanh.'}
          </Typography>
          {!account.googleLinked && (
            <Button
              variant="outlined"
              disabled={!capabilities?.google}
              onClick={() =>
                action(async () => {
                  const r = await post('/auth/google/link');
                  sessionStorage.setItem('thorsReturnTo', '/profile');
                  window.location.assign(r.url);
                })
              }
            >
              Liên kết Google
            </Button>
          )}
        </Stack>
      </MainCard>
      {account.passwordEnabled ? (
        <MainCard title="Đổi mật khẩu">
          <FieldsForm
            initialValues={{ currentPassword: '', password: '', confirmPassword: '' }}
            schema={Yup.object({
              currentPassword: Yup.string().required('Nhập mật khẩu hiện tại.'),
              password,
              confirmPassword: confirmation
            })}
            submitLabel="Đổi mật khẩu"
            onSubmit={async (v) => {
              await post('/auth/change-password', v);
              setAccount(null);
              clearCsrf();
              navigate('/login?message=' + encodeURIComponent('Đã đổi mật khẩu. Vui lòng đăng nhập lại.'));
            }}
          >
            {(form) => (
              <>
                <Field form={form} name="currentPassword" label="Mật khẩu hiện tại" type="password" autoComplete="current-password" />
                <Field form={form} name="password" label="Mật khẩu mới" type="password" autoComplete="new-password" />
                <Field form={form} name="confirmPassword" label="Xác nhận mật khẩu mới" type="password" autoComplete="new-password" />
              </>
            )}
          </FieldsForm>
        </MainCard>
      ) : (
        <MainCard title="Mật khẩu THORS">
          <Typography>
            Tài khoản đang dùng Google. Bạn có thể dùng chức năng quên mật khẩu qua email đã xác minh để thiết lập mật khẩu THORS.
          </Typography>
        </MainCard>
      )}
    </Stack>
  );
}

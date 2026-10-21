import { Link, useNavigate } from 'react-router-dom';
import { Alert, Typography } from '@mui/material';
import * as Yup from 'yup';
import { AuthShell, FieldsForm, Field } from '../components/AuthForm';
import { identity } from '../validation';
import { post } from 'services/http';
export default function ForgotPage() {
  const navigate = useNavigate();
  return (
    <AuthShell title="Quên mật khẩu" subtitle="Nhận OTP qua email đã xác minh.">
      <FieldsForm
        initialValues={{ identifier: '' }}
        schema={Yup.object({ identifier: identity })}
        submitLabel="Gửi mã xác minh"
        onSubmit={async (v) => {
          await post('/auth/forgot-password', v);
          navigate('/auth/verify?reset=1');
        }}
      >
        {(form) => (
          <>
            <Field form={form} name="identifier" label="Email" autoComplete="username" />
          </>
        )}
      </FieldsForm>
      <Alert severity="info">
        Owner có thể liên hệ Admin nếu không còn truy cập được email. Admin liên hệ quản trị nội bộ để khôi phục.
      </Alert>
      <Typography component={Link} to="/login" color="primary">
        Quay lại đăng nhập
      </Typography>
    </AuthShell>
  );
}

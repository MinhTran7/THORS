import { Link, useNavigate } from 'react-router-dom';
import { Alert } from '@mui/material';
import { MailOutlined } from '@ant-design/icons';
import * as Yup from 'yup';
import ShopAuthShell, { ShopField } from '../components/ShopAuthShell';
import { FieldsForm } from '../components/AuthForm';
import { identity } from '../validation';
import { post } from 'services/http';

export default function ForgotPage() {
  const navigate = useNavigate();

  async function sendCode(values) {
    await post('/auth/forgot-password', values);
    navigate('/auth/verify?reset=1');
  }

  return (
    <ShopAuthShell variant="card" title="Quên mật khẩu" subtitle="Nhận OTP qua email đã xác minh.">
      <FieldsForm
        initialValues={{ identifier: '' }}
        schema={Yup.object({ identifier: identity })}
        submitLabel="Gửi mã xác minh"
        onSubmit={sendCode}
      >
        {(form) => <ShopField form={form} name="identifier" label="Email" icon={<MailOutlined />} autoComplete="username" />}
      </FieldsForm>
      <Alert severity="info">
        Owner có thể liên hệ Admin nếu không còn truy cập được email. Admin liên hệ quản trị nội bộ để khôi phục.
      </Alert>
      <p className="shop-auth__switch">
        <Link to="/login">Quay lại đăng nhập</Link>
      </p>
    </ShopAuthShell>
  );
}

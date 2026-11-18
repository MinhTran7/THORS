import { useNavigate } from 'react-router-dom';
import { LockOutlined } from '@ant-design/icons';
import * as Yup from 'yup';
import { FieldsForm } from '../components/AuthForm';
import ShopAuthShell, { ShopField } from '../components/ShopAuthShell';
import { password, confirmation } from '../validation';
import { post, clearCsrf } from 'services/http';
import { useAuth } from '../AuthProvider';
export default function ResetPage() {
  const navigate = useNavigate();
  const { setAccount } = useAuth();
  return (
    <ShopAuthShell variant="card" title="Đặt lại mật khẩu" subtitle="Tạo mật khẩu mới cho tài khoản của bạn.">
      <FieldsForm
        initialValues={{ password: '', confirmPassword: '' }}
        schema={Yup.object({ password, confirmPassword: confirmation })}
        submitLabel="Lưu mật khẩu mới"
        onSubmit={async (v) => {
          await post('/auth/reset-password', v);
          setAccount(null);
          clearCsrf();
          navigate('/login?message=' + encodeURIComponent('Đã đặt lại mật khẩu. Vui lòng đăng nhập lại.'));
        }}
      >
        {(form) => (
          <>
            <ShopField form={form} name="password" label="Mật khẩu mới" type="password" icon={<LockOutlined />} autoComplete="new-password" />
            <ShopField
              form={form}
              name="confirmPassword"
              label="Xác nhận mật khẩu mới"
              type="password"
              icon={<LockOutlined />}
              autoComplete="new-password"
            />
          </>
        )}
      </FieldsForm>
    </ShopAuthShell>
  );
}

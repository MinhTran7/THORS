import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';
import * as Yup from 'yup';
import MainCard from 'components/MainCard';
import { useAuth } from 'features/auth/AuthProvider';
import { FieldsForm, Field } from 'features/auth/components/AuthForm';
import { password, confirmation } from 'features/auth/validation';
import { api, post } from 'services/http';
const roles = { ADMIN: 'Admin', OWNER: 'Chủ cửa hàng', STAFF: 'Nhân viên', FAMILY_MEMBER: 'Thành viên gia đình', CUSTOMER: 'Khách hàng' };
const statuses = { ACTIVE: 'Đang hoạt động', PENDING_VERIFICATION: 'Chờ xác minh', LOCKED: 'Đã khóa', DISABLED: 'Đã vô hiệu hóa' };
export default function AccountsPage() {
  const { account } = useAuth();
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  async function load() {
    try {
      setItems(await api('/accounts'));
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const allowedRoles = account.role === 'ADMIN' ? ['OWNER'] : ['STAFF', 'FAMILY_MEMBER'];
  const selected = dialog?.item;
  const canReset = (a) => (account.role === 'ADMIN' ? a.role === 'OWNER' : ['STAFF', 'FAMILY_MEMBER'].includes(a.role));
  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: 'column', sm: 'row' }} sx={{ justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="h3">Quản lý tài khoản</Typography>
        <Button variant="contained" onClick={() => setDialog({ mode: 'create' })}>
          Tạo tài khoản
        </Button>
      </Stack>
      {error && <Alert severity="error">{error}</Alert>}
      <MainCard content={false}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['Họ tên', 'Email / số điện thoại', 'Vai trò', 'Trạng thái', 'Thao tác'].map((s) => (
                  <TableCell key={s}>{s}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{a.fullName}</TableCell>
                  <TableCell>
                    <Stack>
                      <Typography>{a.email}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {a.phone || 'Chưa bổ sung'}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>{roles[a.role]}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      color={a.status === 'ACTIVE' ? 'success' : a.status === 'PENDING_VERIFICATION' ? 'warning' : 'default'}
                      label={statuses[a.status]}
                    />
                  </TableCell>
                  <TableCell>
                    <Button onClick={() => setDialog({ mode: 'edit', item: a })}>Chỉnh sửa</Button>
                    {canReset(a) && <Button onClick={() => setDialog({ mode: 'reset', item: a })}>Đặt lại mật khẩu</Button>}
                  </TableCell>
                </TableRow>
              ))}
              {!items.length && (
                <TableRow>
                  <TableCell colSpan={5} align="center">
                    {loading ? 'Đang tải…' : 'Chưa có tài khoản.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </MainCard>
      <Dialog open={Boolean(dialog)} onClose={() => setDialog(null)} fullWidth maxWidth="sm">
        <DialogTitle>
          {dialog?.mode === 'create'
            ? 'Tạo tài khoản'
            : dialog?.mode === 'reset'
              ? `Đặt lại mật khẩu: ${selected?.fullName}`
              : 'Chỉnh sửa tài khoản'}
        </DialogTitle>
        <DialogContent sx={{ pt: '12px !important' }}>
          {dialog?.mode === 'create' ? (
            <FieldsForm
              initialValues={{ fullName: '', email: '', phone: '', role: allowedRoles[0], password: '', confirmPassword: '' }}
              schema={Yup.object({
                fullName: Yup.string().trim().required('Nhập họ tên.').max(100),
                email: Yup.string().trim().email('Email không hợp lệ.').required('Nhập email.'),
                phone: Yup.string().nullable(),
                password,
                confirmPassword: confirmation
              })}
              submitLabel="Tạo tài khoản"
              onSubmit={async (v) => {
                await post('/accounts', v);
                setDialog(null);
                await load();
              }}
            >
              {(form) => (
                <>
                  <Field form={form} name="fullName" label="Họ tên" />
                  <Field form={form} name="email" label="Email" type="email" />
                  <Field form={form} name="phone" label="Số điện thoại" />
                  <TextField select name="role" label="Vai trò" value={form.values.role} onChange={form.handleChange}>
                    {allowedRoles.map((r) => (
                      <MenuItem key={r} value={r}>
                        {roles[r]}
                      </MenuItem>
                    ))}
                  </TextField>
                  <Field form={form} name="password" label="Mật khẩu ban đầu" type="password" autoComplete="new-password" />
                  <Field form={form} name="confirmPassword" label="Xác nhận mật khẩu" type="password" autoComplete="new-password" />
                  <Alert severity="info">Người dùng cần xác minh OTP ở lần đăng nhập đầu tiên.</Alert>
                </>
              )}
            </FieldsForm>
          ) : dialog?.mode === 'reset' ? (
            <FieldsForm
              initialValues={{ password: '', confirmPassword: '' }}
              schema={Yup.object({ password, confirmPassword: confirmation })}
              submitLabel="Đặt mật khẩu mới"
              onSubmit={async (v) => {
                await post(`/accounts/${selected.id}/reset-password`, v);
                setDialog(null);
                await load();
              }}
            >
              {(form) => (
                <>
                  <Alert severity="info">Các phiên hiện tại sẽ hết hiệu lực. Người dùng cần xác minh OTP khi đăng nhập lại.</Alert>
                  <Field form={form} name="password" label="Mật khẩu mới" type="password" autoComplete="new-password" />
                  <Field form={form} name="confirmPassword" label="Xác nhận mật khẩu" type="password" autoComplete="new-password" />
                </>
              )}
            </FieldsForm>
          ) : (
            selected && (
              <FieldsForm
                initialValues={{ fullName: selected.fullName, status: selected.status }}
                schema={Yup.object({ fullName: Yup.string().trim().required('Nhập họ tên.').max(100) })}
                submitLabel="Lưu thay đổi"
                onSubmit={async (v) => {
                  await api(`/accounts/${selected.id}`, { method: 'PATCH', body: v });
                  setDialog(null);
                  await load();
                }}
              >
                {(form) => (
                  <>
                    <Field form={form} name="fullName" label="Họ tên" />
                    <TextField
                      select
                      name="status"
                      label="Trạng thái"
                      disabled={selected.id === account.id}
                      value={form.values.status}
                      onChange={form.handleChange}
                    >
                      {Object.entries(statuses).map(([value, label]) => (
                        <MenuItem key={value} value={value} disabled={value === 'PENDING_VERIFICATION' && selected.status !== value}>
                          {label}
                        </MenuItem>
                      ))}
                    </TextField>
                  </>
                )}
              </FieldsForm>
            )
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
}

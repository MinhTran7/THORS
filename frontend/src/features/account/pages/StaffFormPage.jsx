import { useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import useSWR from 'swr';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Alert, Box, MenuItem, TextField, Typography } from '@mui/material';
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

const createSchema = Yup.object({
  fullName,
  email: Yup.string().trim().required('Enter an email address.').email('Enter a valid email address.'),
  phone: phone.required('Enter a phone number.'),
  password: newPassword,
  role: Yup.string().oneOf(['STAFF', 'FAMILY_MEMBER'])
});
const editSchema = Yup.object({ fullName });

// Tạo mới: /staff/new. Chỉnh sửa: /staff/:id/edit (backend chỉ cho sửa tên).
export default function StaffFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  useCrumbs(['Staff', editing ? 'Edit Staff' : 'Add Staff']);
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
          role: data?.role ?? 'STAFF',
          password: '',
          activate: true
        }
      : { fullName: '', email: '', phone: '', password: '', role: 'STAFF', activate: true },
    validationSchema: editing ? editSchema : createSchema,
    onSubmit: async (values) => {
      setError('');
      try {
        if (editing) {
          await accountsApi.rename(id, values.fullName.trim());
          navigate(`/staff/${id}`, { state: { toast: 'Account updated.' } });
          return;
        }
        const created = await accountsApi.create({
          role: values.role,
          fullName: values.fullName.trim(),
          email: values.email.trim(),
          phone: values.phone.trim(),
          password: values.password,
          confirmPassword: values.password
        });
        if (!values.activate) await accountsApi.setStatus(created.id, 'DISABLED');
        navigate('/staff', { state: { toast: `Account created for ${created.fullName}.` } });
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
        back={{ to: editing ? `/staff/${id}` : '/staff', label: editing ? 'Staff detail' : 'Staff list / New account' }}
        title={editing ? 'Edit Account' : 'Staff Form'}
        subtitle={editing ? 'Update the name shown for this account.' : 'Create a secure account for a staff or family member.'}
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' }, gap: 3, alignItems: 'start' }}>
        <Box component="form" onSubmit={form.handleSubmit} noValidate sx={{ ...cardSx, p: 3 }}>
          <Typography variant="h5" sx={{ color: brand.ink }}>
            Account details
          </Typography>
          <Typography variant="caption" sx={{ color: brand.muted }}>
            {editing ? 'Email, phone and role cannot be changed here.' : 'All fields are required. Each person gets their own sign-in.'}
          </Typography>
          <Stack spacing={2.5} sx={{ mt: 2.5 }}>
            <FormField label="Name" error={fieldError('fullName')}>
              <TextInput label="Name" placeholder="Enter full name" {...bind('fullName')} />
            </FormField>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
              <FormField label="Email" error={fieldError('email')}>
                <TextInput label="Email" placeholder="name@example.com" autoComplete="off" disabled={editing} {...bind('email')} />
              </FormField>
              <FormField label="Phone" error={fieldError('phone')}>
                <TextInput label="Phone" placeholder="0912 345 678" autoComplete="off" disabled={editing} {...bind('phone')} />
              </FormField>
            </Box>
            {!editing && (
              <FormField
                label="Password"
                error={fieldError('password')}
                helper="At least 10 characters. The user should change it after their first sign-in."
              >
                <PasswordInput
                  label="Password"
                  placeholder="Create a temporary password"
                  autoComplete="new-password"
                  {...bind('password')}
                />
              </FormField>
            )}
            <FormField label="Role" helper="Available roles: Staff or Family">
              <TextField
                select
                size="small"
                fullWidth
                disabled={editing}
                slotProps={{ htmlInput: { 'aria-label': 'Role' } }}
                {...bind('role')}
                sx={{
                  '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', '& fieldset': { borderColor: brand.line } }
                }}
              >
                <MenuItem value="STAFF">Staff</MenuItem>
                <MenuItem value="FAMILY_MEMBER">Family</MenuItem>
              </TextField>
            </FormField>
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
                    Activate account immediately
                  </Typography>
                  <Typography variant="caption" sx={{ color: brand.muted }}>
                    The user can sign in as soon as their account is created.
                  </Typography>
                </Box>
                <BrandSwitch
                  checked={form.values.activate}
                  onChange={(event) => form.setFieldValue('activate', event.target.checked)}
                  slotProps={{ input: { 'aria-label': 'Activate account immediately' } }}
                />
              </Stack>
            )}
            <Stack direction="row" spacing={1.5} justifyContent="flex-end">
              <OutlineButton component={RouterLink} to={editing ? `/staff/${id}` : '/staff'}>
                Cancel
              </OutlineButton>
              <BrandButton type="submit" disabled={form.isSubmitting || (editing && !data)}>
                {form.isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Create Account'}
              </BrandButton>
            </Stack>
          </Stack>
        </Box>

        <Stack spacing={2.5}>
          <Box sx={{ ...cardSx, p: 3 }}>
            <Typography variant="h5" sx={{ color: brand.ink, mb: 2 }}>
              Choose the right role
            </Typography>
            <Stack spacing={2}>
              <Box>
                <RoleChip role="STAFF" />
                <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 0.75 }}>
                  For your store team. Staff can manage products, update stock and view categories.
                </Typography>
              </Box>
              <Box>
                <RoleChip role="FAMILY_MEMBER" />
                <Typography variant="caption" sx={{ color: brand.muted, display: 'block', mt: 0.75 }}>
                  For trusted family members. Family accounts have view-only access to store information.
                </Typography>
              </Box>
            </Stack>
          </Box>
          <NoticeBox title="Your store, your control" icon={<InfoCircleOutlined />}>
            Only the Shop Owner can add accounts, change roles or activate and deactivate access.
          </NoticeBox>
          <NoticeBox title="A secure start" icon={<InfoCircleOutlined />}>
            Share temporary credentials privately. Ask the new member to update their password after signing in.
          </NoticeBox>
        </Stack>
      </Box>
    </Box>
  );
}
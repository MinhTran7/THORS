import { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';
import { Alert, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { Stack } from './Flex';
import { accountsApi } from '../api';
import { brand } from '../tokens';
import { confirmPassword, newPassword } from '../validation';
import { BrandButton, OutlineButton } from './Brand';
import { FormField, PasswordInput } from './Form';

const schema = Yup.object({ password: newPassword, confirmPassword });

// Dùng cho: Admin đặt lại mật khẩu Shop Owner, Owner đặt lại mật khẩu Staff/Family.
export default function ResetPasswordDialog({ account, onClose, onDone }) {
  const [error, setError] = useState('');
  const form = useFormik({
    initialValues: { password: '', confirmPassword: '' },
    validationSchema: schema,
    onSubmit: async (values) => {
      setError('');
      try {
        await accountsApi.resetPassword(account.id, values);
        onDone(`Password reset for ${account.fullName}.`);
      } catch (e) {
        setError(e.message);
      }
    }
  });
  const fieldError = (name) => (form.touched[name] && form.errors[name]) || '';

  return (
    <Dialog open={Boolean(account)} onClose={onClose} fullWidth maxWidth="xs">
      <form onSubmit={form.handleSubmit} noValidate>
        <DialogTitle>Reset password</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: brand.muted, mb: 2 }}>
            {`Set a new password for ${account?.fullName}. They will be signed out everywhere and should change it after signing in.`}
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Stack spacing={2}>
            <FormField label="New password" error={fieldError('password')}>
              <PasswordInput
                label="New password"
                name="password"
                autoComplete="new-password"
                value={form.values.password}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
                error={Boolean(fieldError('password'))}
              />
            </FormField>
            <FormField label="Confirm password" error={fieldError('confirmPassword')}>
              <PasswordInput
                label="Confirm password"
                name="confirmPassword"
                autoComplete="new-password"
                value={form.values.confirmPassword}
                onChange={form.handleChange}
                onBlur={form.handleBlur}
                error={Boolean(fieldError('confirmPassword'))}
              />
            </FormField>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <OutlineButton onClick={onClose}>Cancel</OutlineButton>
          <BrandButton type="submit" disabled={form.isSubmitting}>
            {form.isSubmitting ? 'Resetting…' : 'Reset password'}
          </BrandButton>
        </DialogActions>
      </form>
    </Dialog>
  );
}
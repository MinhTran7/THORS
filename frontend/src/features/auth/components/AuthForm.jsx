import { useState } from 'react';
import { Alert, Button, Stack, Typography, TextField, InputAdornment, IconButton } from '@mui/material';
import { Formik, Form } from 'formik';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import AuthWrapper from 'sections/auth/AuthWrapper';
export function AuthShell({ title, subtitle, children }) {
  return (
    <AuthWrapper>
      <Stack spacing={3}>
        <Stack spacing={1}>
          <Typography variant="h3">{title}</Typography>
          <Typography color="text.secondary">{subtitle}</Typography>
        </Stack>
        {children}
      </Stack>
    </AuthWrapper>
  );
}
export function FieldsForm({ initialValues, schema, onSubmit, submitLabel, children }) {
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  return (
    <Formik
      enableReinitialize
      initialValues={initialValues}
      validationSchema={schema}
      onSubmit={async (values, helpers) => {
        setError('');
        setSuccess('');
        try {
          const result = await onSubmit(values, helpers);
          if (typeof result === 'string') setSuccess(result);
        } catch (e) {
          setError(e.message);
        } finally {
          helpers.setSubmitting(false);
        }
      }}
    >
      {(form) => (
        <Form noValidate>
          <Stack spacing={2.5}>
            {error && (
              <Alert severity="error" role="alert">
                {error}
              </Alert>
            )}
            {success && <Alert severity="success">{success}</Alert>}
            {children(form)}
            <Button type="submit" variant="contained" size="large" disabled={form.isSubmitting} fullWidth>
              {form.isSubmitting ? 'Đang xử lý…' : submitLabel}
            </Button>
          </Stack>
        </Form>
      )}
    </Formik>
  );
}
export function Field({ form, name, label, type = 'text', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextField
      fullWidth
      name={name}
      label={label}
      value={form.values[name]}
      onChange={form.handleChange}
      onBlur={form.handleBlur}
      error={Boolean(form.touched[name] && form.errors[name])}
      helperText={form.touched[name] && form.errors[name]}
      type={type === 'password' && visible ? 'text' : type}
      slotProps={
        type === 'password'
          ? {
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton type="button" aria-label={visible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} onClick={() => setVisible(!visible)}>
                      {visible ? <EyeInvisibleOutlined /> : <EyeOutlined />}
                    </IconButton>
                  </InputAdornment>
                )
              }
            }
          : undefined
      }
      {...props}
    />
  );
}

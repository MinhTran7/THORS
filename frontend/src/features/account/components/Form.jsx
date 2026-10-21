import { useState } from 'react';
import { FormHelperText, IconButton, InputAdornment, TextField, Typography } from '@mui/material';
import { Stack } from './Flex';
import { EyeInvisibleOutlined, EyeOutlined } from '@ant-design/icons';
import { brand } from '../tokens';

export function FormField({ label, error, helper, children }) {
  return (
    <Stack spacing={0.75}>
      <Typography variant="subtitle2" sx={{ color: brand.ink, fontWeight: 600 }}>
        {label}
      </Typography>
      {children}
      {error ? (
        <FormHelperText error sx={{ mx: 0 }}>
          {error}
        </FormHelperText>
      ) : (
        helper && <FormHelperText sx={{ mx: 0 }}>{helper}</FormHelperText>
      )}
    </Stack>
  );
}

const inputSx = { '& .MuiOutlinedInput-root': { bgcolor: brand.surface, borderRadius: '10px', '& fieldset': { borderColor: brand.line } } };

export function TextInput({ sx, label, ...props }) {
  return <TextField fullWidth size="small" slotProps={{ htmlInput: { 'aria-label': label } }} {...props} sx={{ ...inputSx, ...sx }} />;
}

export function PasswordInput({ label, ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <TextInput
      label={label}
      {...props}
      type={visible ? 'text' : 'password'}
      slotProps={{
        htmlInput: { 'aria-label': label },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                edge="end"
                size="small"
                aria-label={visible ? 'Hide password' : 'Show password'}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              </IconButton>
            </InputAdornment>
          )
        }
      }}
    />
  );
}
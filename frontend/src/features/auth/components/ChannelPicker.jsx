import { useEffect, useState } from 'react';
import { Alert, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { api } from 'services/http';
export function useCapabilities() {
  const [capabilities, setCapabilities] = useState(null);
  useEffect(() => {
    api('/auth/capabilities')
      .then(setCapabilities)
      .catch(() => setCapabilities({ email: false, sms: false, google: false }));
  }, []);
  return capabilities;
}
export default function ChannelPicker({ form, capabilities, smsAllowed = true }) {
  const { values, setFieldValue } = form;
  useEffect(() => {
    if (!capabilities) return;
    if (values.channel === 'EMAIL' && !capabilities.email && capabilities.sms && smsAllowed) setFieldValue('channel', 'SMS');
    if (values.channel === 'SMS' && (!capabilities.sms || !smsAllowed) && capabilities.email) setFieldValue('channel', 'EMAIL');
  }, [values.channel, capabilities, smsAllowed, setFieldValue]);
  return (
    <Stack spacing={1}>
      <FormControl fullWidth>
        <InputLabel id="otp-channel">Nhận mã xác minh qua</InputLabel>
        <Select labelId="otp-channel" name="channel" value={form.values.channel} label="Nhận mã xác minh qua" onChange={form.handleChange}>
          <MenuItem value="EMAIL" disabled={capabilities && !capabilities.email}>
            Email
          </MenuItem>
          <MenuItem value="SMS" disabled={!smsAllowed || (capabilities && !capabilities.sms)}>
            SMS
          </MenuItem>
        </Select>
      </FormControl>
      {capabilities && !capabilities.email && !capabilities.sms && (
        <Alert severity="info">Dịch vụ gửi mã xác minh chưa sẵn sàng. Vui lòng liên hệ người quản trị.</Alert>
      )}
    </Stack>
  );
}

import { createContext, useContext, useState } from 'react';
import useSWR from 'swr';
import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import { api } from 'services/http';
import { useAuth } from 'features/auth/AuthProvider';
const Context = createContext();
export function WarehouseProvider({ children }) {
  const { account } = useAuth();
  const snapshot = useSWR('/warehouse/snapshot', api, { revalidateOnFocus: true });
  const documents = useSWR('/warehouse/documents', api, { revalidateOnFocus: true });
  const notices = useSWR('/warehouse/notifications', api);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const reload = async () => {
    await Promise.all([snapshot.mutate(), documents.mutate(), notices.mutate()]);
  };
  const run = async (fn, success) => {
    setError('');
    setMessage('');
    setBusy(true);
    try {
      const result = await fn();
      await reload();
      if (success) setMessage(success);
      return result;
    } catch (e) {
      setError(e.message);
      throw e;
    } finally {
      setBusy(false);
    }
  };
  const failure = snapshot.error || documents.error;
  if (failure)
    return (
      <Alert severity="error" action={<Button onClick={reload}>Thử lại</Button>}>
        {failure.message}
      </Alert>
    );
  if (!snapshot.data || !documents.data)
    return (
      <Stack sx={{ p: 8, alignItems: 'center' }}>
        <CircularProgress aria-label="Đang tải dữ liệu kho" />
      </Stack>
    );
  return (
    <Context.Provider
      value={{
        data: snapshot.data,
        documents: documents.data,
        notices: notices.data || [],
        noticeError: notices.error,
        owner: account.role === 'OWNER',
        account,
        reload,
        run,
        busy
      }}
    >
      <Stack spacing={2}>
        {error && (
          <Alert severity="error" onClose={() => setError('')}>
            {error}
          </Alert>
        )}
        {message && (
          <Alert severity="success" onClose={() => setMessage('')}>
            {message}
          </Alert>
        )}
        {children}
      </Stack>
    </Context.Provider>
  );
}
export const useWarehouse = () => useContext(Context);

import { useCallback, useState } from 'react';
import { Alert, Snackbar } from '@mui/material';

// const [toast, showToast] = useToast();  ...  {toast}  ...  showToast('Saved') / showToast('Failed', 'error')
export function useToast() {
  const [state, setState] = useState({ open: false, message: '', severity: 'success' });
  const show = useCallback((message, severity = 'success') => setState({ open: true, message, severity }), []);
  const close = () => setState((current) => ({ ...current, open: false }));
  const node = (
    <Snackbar open={state.open} autoHideDuration={4500} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
      <Alert severity={state.severity} variant="filled" onClose={close} sx={{ width: '100%' }}>
        {state.message}
      </Alert>
    </Snackbar>
  );
  return [node, show];
}
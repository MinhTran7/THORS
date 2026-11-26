import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import useSWR, { mutate as mutateGlobal } from 'swr';
import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import { api } from 'services/http';
import { useAuth } from 'features/auth/AuthProvider';
import { refreshNotifications } from 'features/notification/api';
const Context = createContext();
export function WarehouseProvider({ children }) {
  const { account } = useAuth();
  const snapshot = useSWR('/warehouse/snapshot', api, { revalidateOnFocus: true });
  const documents = useSWR('/warehouse/documents', api, { revalidateOnFocus: true });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  // Lần cuối tải lại toàn bộ dữ liệu kho (để chuyển trang không tải lại khi dữ liệu còn mới)
  const lastReload = useRef(Date.now());
  const reload = async () => {
    lastReload.current = Date.now();
    await Promise.all([
      snapshot.mutate(),
      documents.mutate(),
      // Warehouse notices live in the shared notification bell; refresh its count too.
      refreshNotifications(),
      // Order list/detail/picker, per-document history/settlements and supplier credit views are
      // computed by the backend; refresh them as well.
      mutateGlobal(
        (key) => typeof key === 'string' && /^\/warehouse\/(orders|order-variants|suppliers|supplier-credits|documents\/\d+\/|inventory|counts|history|move-requests)/.test(key)
      )
    ]);
  };
  // Provider nằm ở route cha /warehouse nên không remount khi đổi trang con.
  //  - Bấm lại đúng trang đang mở → tải lại toàn bộ dữ liệu kho (làm mới thủ công).
  //  - Sang trang khác → KHÔNG tải lại toàn bộ: trang mới hiện ngay dữ liệu đã có, danh sách riêng của trang
  //    tự tải khi mở (SWR). Chỉ làm mới ngầm snapshot + phiếu nếu đã quá 60 giây kể từ lần tải trước,
  //    để request của trang mới không phải xếp hàng sau hàng loạt request tải lại.
  //  - Chỉ đổi ?id=… để mở chi tiết → không tải lại.
  //  Sau mỗi thao tác lưu (run) và khi quay lại tab trình duyệt, dữ liệu vẫn được làm mới như cũ.
  const location = useLocation();
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const refreshRef = useRef(null);
  refreshRef.current = () => {
    lastReload.current = Date.now();
    snapshot.mutate();
    documents.mutate();
  };
  const last = useRef(null);
  useEffect(() => {
    const prev = last.current;
    last.current = location;
    if (!prev || prev.key === location.key) return;
    const samePage = prev.pathname === location.pathname;
    if (samePage && prev.search === location.search) reloadRef.current();
    else if (!samePage && Date.now() - lastReload.current > 60000) refreshRef.current();
  }, [location]);
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

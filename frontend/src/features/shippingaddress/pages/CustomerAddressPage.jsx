import { useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { PlusOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCrumbs } from 'layouts/crumbs';
import { StoreAccountShell } from 'features/account/components/StoreAccount';
import { C as STORE } from 'features/shop/storeTheme';
import AddressCard from '../components/AddressCard';
import { ConfirmDialog, NoticeDialog } from '../components/AddressDialogs';
import EmptyAddresses from '../components/EmptyAddresses';
import ErrorBanner from '../components/ErrorBanner';
import { useAddresses } from '../hooks';
import { C, addButtonSx } from '../theme';
import { DEFAULT_NOTICE, LIMIT_NOTICE, MAX_ADDRESSES } from '../utils';

// Nội dung hộp xác nhận theo từng thao tác
const CONFIRMS = {
  default: {
    title: 'Đặt làm địa chỉ mặc định?',
    message: (a) => (
      <>
        Địa chỉ <strong>{a.addressDetail}</strong> sẽ được ưu tiên chọn khi thanh toán.
      </>
    ),
    confirmLabel: 'Đặt mặc định',
    busyLabel: 'Đang lưu...',
    failText: 'Không thể đặt địa chỉ mặc định.'
  },
  delete: {
    title: 'Xóa địa chỉ giao hàng?',
    message: (a) => (
      <>
        Bạn có chắc muốn xóa địa chỉ <strong>{a.addressDetail}</strong> không?
      </>
    ),
    confirmLabel: 'Xóa địa chỉ',
    busyLabel: 'Đang xóa...',
    failText: 'Không thể xóa địa chỉ giao hàng.',
    danger: true
  }
};

export default function CustomerAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi']);
  const navigate = useNavigate();
  const { addresses, loading, error, clearError, makeDefault, remove } = useAddresses();
  const [notice, setNotice] = useState(null);
  // Thao tác đang chờ xác nhận: { action: 'default' | 'delete', address }
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pendingError, setPendingError] = useState('');

  // Chặn sớm ở giao diện; backend vẫn kiểm tra lại giới hạn 5 địa chỉ và địa chỉ mặc định
  function handleAdd() {
    if (addresses.length >= MAX_ADDRESSES) setNotice(LIMIT_NOTICE);
    else navigate('/addresses/new');
  }

  function handleDelete(address) {
    if (address.isDefault) setNotice(DEFAULT_NOTICE);
    else setPending({ action: 'delete', address });
  }

  function closeConfirm() {
    if (busy) return;
    setPending(null);
    setPendingError('');
  }

  async function confirm() {
    setBusy(true);
    setPendingError('');
    try {
      await (pending.action === 'delete' ? remove : makeDefault)(pending.address);
      setPending(null);
    } catch (err) {
      setPendingError(err.message || CONFIRMS[pending.action].failText);
    } finally {
      setBusy(false);
    }
  }

  // Giữ nội dung lần xác nhận cuối để hộp thoại không đổi chữ khi đang đóng
  const lastPending = useRef(null);
  if (pending) lastPending.current = pending;
  const shown = lastPending.current;
  const dialog = shown ? CONFIRMS[shown.action] : CONFIRMS.default;

  return (
    <StoreAccountShell
      title="Địa chỉ giao hàng"
      subtitle="Lưu địa chỉ giao hàng để thanh toán nhanh hơn."
      action={
        addresses.length > 0 && (
          <Box component="button" type="button" onClick={handleAdd} sx={addButtonSx}>
            <PlusOutlined />
            Thêm địa chỉ mới
          </Box>
        )
      }
    >
      <ErrorBanner message={error} onClose={clearError} />

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} sx={{ color: STORE.accent }} />
        </Box>
      ) : addresses.length === 0 ? (
        <EmptyAddresses onAdd={handleAdd} />
      ) : (
        <>
          <Typography sx={{ fontSize: 13, color: C.muted, mb: 1.5 }}>
            Đã lưu <strong style={{ color: '#111111' }}>{addresses.length}</strong>/{MAX_ADDRESSES} địa chỉ
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {addresses.map((a) => (
              <AddressCard
                key={a.addressId}
                address={a}
                onDefault={() => setPending({ action: 'default', address: a })}
                onEdit={() => navigate(`/addresses/${a.addressId}/edit`)}
                onDelete={() => handleDelete(a)}
              />
            ))}
          </Box>
        </>
      )}

      <NoticeDialog notice={notice} onClose={() => setNotice(null)} />
      <ConfirmDialog
        open={Boolean(pending)}
        title={dialog.title}
        message={shown && dialog.message(shown.address)}
        confirmLabel={dialog.confirmLabel}
        busyLabel={dialog.busyLabel}
        danger={dialog.danger}
        busy={busy}
        error={pendingError}
        onCancel={closeConfirm}
        onConfirm={confirm}
      />
    </StoreAccountShell>
  );
}

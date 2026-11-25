import { useEffect, useState } from 'react';
import { Box, Typography, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, IconButton } from '@mui/material';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  StarFilled,
  StarOutlined,
  UserOutlined,
  PhoneOutlined,
  CloseOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCrumbs } from '../../layouts/crumbs';
import { getShippingAddresses, deleteShippingAddress, setDefaultShippingAddress } from '../../services/shippingAddressService';
import { StoreAccountShell } from 'features/account/components/StoreAccount';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from './theme';
import { C as STORE, focusRing } from 'features/shop/storeTheme';

const MAX_ADDRESSES = 5;

const YELLOW = { bg: '#FEF9C3', border: '#FDE68A', text: '#A16207', star: '#FACC15' };

const LIMIT_NOTICE = {
  title: 'Đã đạt giới hạn địa chỉ',
  content: (
    <>
      Bạn đã lưu tối đa <strong>{MAX_ADDRESSES} địa chỉ giao hàng</strong>. Vui lòng xóa bớt địa chỉ không còn sử dụng để thêm địa chỉ mới.
    </>
  )
};

const DEFAULT_NOTICE = {
  title: 'Không thể xóa địa chỉ mặc định',
  content: 'Nếu muốn xóa địa chỉ này, hãy đặt một địa chỉ khác làm mặc định trước.'
};

const addButtonSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 1,
  height: 46,
  px: 3,
  border: 0,
  borderRadius: 0,
  bgcolor: STORE.accent,
  color: '#FFFFFF',
  fontFamily: 'inherit',
  fontSize: 14.5,
  fontWeight: 800,
  cursor: 'pointer',
  transition: 'background-color 0.15s ease',
  '&:hover': { bgcolor: STORE.primaryDark },
  ...focusRing
};

const TONES = {
  neutral: { color: '#1F2937', bg: '#FFFFFF', border: C.border, hover: '#F8FAFC' },
  danger: { color: '#DC2626', bg: '#FFFFFF', border: '#FECACA', hover: '#FEF2F2' }
};

function ActionButton({ tone, icon, children, ...props }) {
  const t = TONES[tone];
  return (
    <Box
      component="button"
      type="button"
      {...props}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        height: 34,
        px: 1.5,
        borderRadius: '10px',
        border: `1px solid ${t.border}`,
        bgcolor: t.bg,
        color: t.color,
        fontFamily: 'inherit',
        fontSize: 13,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        '&:hover': { bgcolor: t.hover },
        '&:disabled': { opacity: 0.6, cursor: 'default' },
        ...focusRing
      }}
    >
      {icon}
      {children}
    </Box>
  );
}

function AddressCard({ address: a, busy, defaulting, onDefault, onEdit, onDelete }) {
  return (
    <Box
      sx={{
        position: 'relative',
        bgcolor: C.surface,
        borderRadius: '18px',
        border: a.isDefault ? `1.5px solid ${STORE.accent}` : `1px solid ${C.border}`,
        p: { xs: 2, sm: 2.5 },
        display: 'flex',
        flexDirection: 'column',
        gap: 2
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box
          sx={{
            width: 42,
            height: 42,
            borderRadius: '12px',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: a.isDefault ? YELLOW.bg : STORE.sand,
            color: a.isDefault ? YELLOW.text : STORE.accent
          }}
        >
          <EnvironmentOutlined style={{ fontSize: 19 }} />
        </Box>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: '#0F172A', lineHeight: 1.3, wordBreak: 'break-word' }}>
              {a.addressDetail}
            </Typography>
            {a.isDefault ? (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 0.5,
                  flexShrink: 0,
                  px: 1.25,
                  py: 0.35,
                  borderRadius: 99,
                  bgcolor: YELLOW.bg,
                  border: `1px solid ${YELLOW.border}`,
                  color: YELLOW.text,
                  fontSize: 11.5,
                  fontWeight: 800
                }}
              >
                <StarFilled style={{ fontSize: 11, color: YELLOW.star }} />
                Mặc định
              </Box>
            ) : (
              <IconButton
                size="small"
                title="Đặt làm mặc định"
                aria-label="Đặt làm mặc định"
                disabled={busy}
                onClick={onDefault}
                sx={{ flexShrink: 0, mt: -0.5, mr: -0.5, '&:hover': { bgcolor: YELLOW.bg } }}
              >
                {defaulting ? (
                  <CircularProgress size={16} sx={{ color: YELLOW.star }} />
                ) : (
                  <StarOutlined style={{ fontSize: 20, color: YELLOW.star }} />
                )}
              </IconButton>
            )}
          </Box>
          <Typography sx={{ fontSize: 13.5, color: C.muted, mt: 0.25, lineHeight: 1.5 }}>
            {a.wardName}, {a.provinceName}
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 2.5, rowGap: 0.5, color: '#374151', fontSize: 13.5 }}>
        <Box title="Tên người nhận" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontWeight: 700 }}>
          <UserOutlined style={{ fontSize: 14, color: C.muted }} />
          {a.recipientName}
        </Box>
        <Box title="Số điện thoại" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
          <PhoneOutlined style={{ fontSize: 14, color: C.muted }} />
          {a.phone}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        {a.isDefault ? <Typography sx={{ fontSize: 13, color: C.muted }}>Ưu tiên khi thanh toán</Typography> : <Box />}

        <Box sx={{ display: 'flex', gap: 1 }}>
          <ActionButton tone="neutral" onClick={onEdit} icon={<EditOutlined style={{ fontSize: 13 }} />}>
            Chỉnh sửa
          </ActionButton>
          <ActionButton tone="danger" onClick={onDelete} icon={<DeleteOutlined style={{ fontSize: 13 }} />}>
            Xóa
          </ActionButton>
        </Box>
      </Box>
    </Box>
  );
}

export default function CustomerAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi']);
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState(null);
  const [defaulting, setDefaulting] = useState(null);

  async function load() {
    setLoading(true);
    try {
      setAddresses(await getShippingAddresses());
      setError('');
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách địa chỉ giao hàng.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function handleAddAddress() {
    if (addresses.length >= MAX_ADDRESSES) {
      setNotice(LIMIT_NOTICE);
      return;
    }
    navigate('/addresses/new');
  }

  async function makeDefault(address) {
    setDefaulting(address.addressId);
    try {
      await setDefaultShippingAddress(address.addressId);
      await load();
    } catch (err) {
      setError(err.message || 'Không thể đặt địa chỉ mặc định.');
    } finally {
      setDefaulting(null);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteShippingAddress(target.addressId);
      setTarget(null);
      await load();
    } catch (err) {
      setTarget(null);
      setError(err.message || 'Không thể xóa địa chỉ giao hàng.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <StoreAccountShell
      title="Địa chỉ giao hàng"
      subtitle="Lưu địa chỉ giao hàng để thanh toán nhanh hơn."
      action={
        addresses.length > 0 && (
          <Box component="button" type="button" onClick={handleAddAddress} sx={addButtonSx}>
            <PlusOutlined />
            Thêm địa chỉ mới
          </Box>
        )
      }
    >
      {error && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.25,
            mb: 2.5,
            px: 2,
            py: 1.25,
            borderRadius: '12px',
            bgcolor: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#B91C1C',
            fontSize: 13.5,
            fontWeight: 600
          }}
        >
          <ExclamationCircleOutlined style={{ fontSize: 16 }} />
          <Box sx={{ flex: 1 }}>{error}</Box>
          <IconButton size="small" onClick={() => setError('')} sx={{ color: '#B91C1C' }}>
            <CloseOutlined style={{ fontSize: 12 }} />
          </IconButton>
        </Box>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} sx={{ color: STORE.accent }} />
        </Box>
      ) : addresses.length === 0 ? (
        <Box sx={{ ...cardSx, p: { xs: 4, md: 8 }, textAlign: 'center', boxShadow: 'none', border: `1px solid ${C.border}` }}>
          <Box
            sx={{
              width: 112,
              height: 112,
              mx: 'auto',
              mb: 2.5,
              borderRadius: '50%',
              bgcolor: STORE.sand,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <EnvironmentOutlined style={{ fontSize: 40, color: STORE.accent }} />
          </Box>
          <Typography sx={{ fontSize: 18, fontWeight: 800, mb: 1 }}>Bạn chưa lưu địa chỉ giao hàng nào</Typography>
          <Typography sx={{ fontSize: 13.5, color: C.muted, maxWidth: 420, mx: 'auto', mb: 3, lineHeight: 1.6 }}>
            Thêm địa chỉ nhận hàng để thanh toán nhanh hơn và theo dõi đơn hàng chính xác.
          </Typography>
          <Box component="button" type="button" onClick={handleAddAddress} sx={addButtonSx}>
            <PlusOutlined />
            Thêm địa chỉ giao hàng
          </Box>
        </Box>
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
                busy={defaulting !== null}
                defaulting={defaulting === a.addressId}
                onDefault={() => makeDefault(a)}
                onEdit={() => navigate(`/addresses/${a.addressId}/edit`)}
                onDelete={() => (a.isDefault ? setNotice(DEFAULT_NOTICE) : setTarget(a))}
              />
            ))}
          </Box>
        </>
      )}

      <Dialog
        open={Boolean(notice)}
        onClose={() => setNotice(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: '24px', p: 1 } } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 17 }}>{notice?.title}</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>{notice?.content}</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="inherit" onClick={() => setNotice(null)} sx={primaryButtonSx}>
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(target)}
        onClose={() => !deleting && setTarget(null)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: '24px', p: 1 } } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 17 }}>Xóa địa chỉ giao hàng?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: C.muted }}>
            Bạn có chắc muốn xóa địa chỉ của <strong>{target?.recipientName}</strong> không?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            color="inherit"
            onClick={() => setTarget(null)}
            disabled={deleting}
            sx={{
              ...outlineButtonSx,
              '&:hover': { bgcolor: C.surface, borderColor: C.border, color: '#374151' }
            }}
          >
            Hủy
          </Button>
          <Button
            color="inherit"
            onClick={confirmDelete}
            disabled={deleting}
            sx={{
              ...outlineButtonSx,
              borderColor: '#F2A3A3',
              color: C.error,
              '&:hover': { bgcolor: C.surface, borderColor: '#F2A3A3', color: C.error }
            }}
          >
            {deleting ? 'Đang xóa...' : 'Xóa địa chỉ'}
          </Button>
        </DialogActions>
      </Dialog>
    </StoreAccountShell>
  );
}

import { useEffect, useState } from 'react';
import { Box, Typography, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Divider } from '@mui/material';
import { PhoneOutlined, PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined, StarFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCrumbs } from '../../layouts/crumbs';
import { getShippingAddresses, deleteShippingAddress } from '../../services/shippingAddressService';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from './theme';

const MAX_ADDRESSES = 5;

const linkButtonSx = (color, hoverBg) => ({
  textTransform: 'none',
  fontSize: 13,
  fontWeight: 600,
  color,
  borderRadius: 1.5,
  px: 1,
  '&:hover': { bgcolor: hoverBg }
});

export default function CustomerAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi']);
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const full = addresses.length >= MAX_ADDRESSES;

  return (
    <Box sx={{ maxWidth: 880, mx: 'auto', color: C.text, pb: 6 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box>
          <Typography variant="h3" sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: 22, sm: 26 } }}>
            Địa chỉ của tôi
          </Typography>
          {full && (
            <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>
              Bạn đã lưu tối đa {MAX_ADDRESSES} địa chỉ. Hãy xóa bớt để thêm địa chỉ mới.
            </Typography>
          )}
        </Box>
        {addresses.length > 0 && (
          <Button startIcon={<PlusOutlined />} disabled={full} onClick={() => navigate('/addresses/new')} sx={primaryButtonSx}>
            Thêm địa chỉ mới
          </Button>
        )}
      </Box>

      {error && <Typography sx={{ color: C.error, fontSize: 13.5, fontWeight: 600, mb: 2 }}>{error}</Typography>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} sx={{ color: C.cyan }} />
        </Box>
      ) : addresses.length === 0 ? (
        <Box sx={{ ...cardSx, p: { xs: 4, md: 8 }, textAlign: 'center' }}>
          <Box
            sx={{
              width: 120,
              height: 120,
              mx: 'auto',
              mb: 2.5,
              borderRadius: '50%',
              bgcolor: '#F0FDFA',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <EnvironmentOutlined style={{ fontSize: 40, color: '#0D9488' }} />
          </Box>
          <Typography sx={{ fontSize: 18, fontWeight: 800, mb: 1 }}>Bạn chưa lưu địa chỉ giao hàng nào</Typography>
          <Typography sx={{ fontSize: 13.5, color: C.muted, maxWidth: 420, mx: 'auto', mb: 3, lineHeight: 1.6 }}>
            Thêm địa chỉ nhận hàng để thanh toán nhanh hơn và theo dõi đơn hàng chính xác.
          </Typography>
          <Button startIcon={<PlusOutlined />} onClick={() => navigate('/addresses/new')} sx={primaryButtonSx}>
            Thêm địa chỉ giao hàng
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {addresses.map((a) => (
            <Box
              key={a.addressId}
              sx={{
                ...cardSx,
                borderRadius: 3,
                border: `1.5px solid ${a.isDefault ? C.cyan : C.border}`,
                p: { xs: 2.5, sm: 3 }
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: 16, color: '#0F172A' }}>{a.recipientName}</Typography>
                    <Typography sx={{ color: '#CBD5E1' }}>|</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: C.muted, fontSize: 13.5 }}>
                      <PhoneOutlined style={{ fontSize: 12.5 }} />
                      {a.phone}
                    </Box>
                  </Box>
                  <Typography sx={{ fontSize: 14.5, color: '#334155', fontWeight: 500, mt: 1 }}>{a.addressDetail}</Typography>
                  <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.4 }}>
                    {a.wardName}, {a.provinceName}
                  </Typography>
                </Box>
                {a.isDefault && (
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.6,
                      bgcolor: '#FEF9C3',
                      color: '#854D0E',
                      px: 1.4,
                      py: 0.4,
                      borderRadius: 99,
                      fontSize: 12,
                      fontWeight: 700,
                      border: '1px solid #FDE047',
                      flexShrink: 0
                    }}
                  >
                    <StarFilled style={{ fontSize: 11, color: '#EAB308' }} />
                    Mặc định
                  </Box>
                )}
              </Box>

              <Divider sx={{ my: 2, borderColor: C.borderLight }} />

              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                <Button
                  startIcon={<EditOutlined />}
                  onClick={() => navigate(`/addresses/${a.addressId}/edit`)}
                  sx={linkButtonSx('#475569', C.borderLight)}
                >
                  Chỉnh sửa
                </Button>
                {!a.isDefault && (
                  <Button startIcon={<DeleteOutlined />} onClick={() => setTarget(a)} sx={linkButtonSx(C.error, '#FEF2F2')}>
                    Xóa
                  </Button>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Dialog
        open={Boolean(target)}
        onClose={() => !deleting && setTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 17 }}>Xóa địa chỉ giao hàng?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: C.muted }}>
            Bạn có chắc muốn xóa địa chỉ của <strong>{target?.recipientName}</strong> không?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button onClick={() => setTarget(null)} disabled={deleting} sx={outlineButtonSx}>
            Hủy
          </Button>
          <Button
            onClick={confirmDelete}
            disabled={deleting}
            sx={{ ...outlineButtonSx, border: 'none', bgcolor: '#FEE2E2', color: '#DC2626', fontWeight: 700, '&:hover': { bgcolor: '#FCA5A5' } }}
          >
            {deleting ? 'Đang xóa...' : 'Xóa địa chỉ'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

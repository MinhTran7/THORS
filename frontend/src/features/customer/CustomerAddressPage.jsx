import { useEffect, useState } from 'react';
import { Box, Typography, Button, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions, Divider } from '@mui/material';
import { PlusOutlined, EditOutlined, DeleteOutlined, EnvironmentOutlined, StarFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCrumbs } from '../../layouts/crumbs';
import { getShippingAddresses, deleteShippingAddress } from '../../services/shippingAddressService';
import { StoreAccountShell } from 'features/account/components/StoreAccount';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from './theme';

const MAX_ADDRESSES = 5;

export default function CustomerAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi']);
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [limitAlert, setLimitAlert] = useState(false);

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
      setLimitAlert(true);
      return;
    }
    navigate('/addresses/new');
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
          <Button startIcon={<PlusOutlined />} onClick={handleAddAddress} sx={primaryButtonSx}>
            Thêm địa chỉ mới
          </Button>
        )
      }
    >
      {error && <Typography sx={{ color: C.error, fontSize: 13.5, fontWeight: 600, mb: 2 }}>{error}</Typography>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} sx={{ color: C.cyan }} />
        </Box>
      ) : addresses.length === 0 ? (
        <Box sx={{ ...cardSx, p: { xs: 4, md: 8 }, textAlign: 'center', boxShadow: 'none', border: `1px solid ${C.border}` }}>
          <Box
            sx={{
              width: 120,
              height: 120,
              mx: 'auto',
              mb: 2.5,
              borderRadius: '50%',
              bgcolor: '#E6F9FB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <EnvironmentOutlined style={{ fontSize: 40, color: C.teal }} />
          </Box>
          <Typography sx={{ fontSize: 18, fontWeight: 800, mb: 1 }}>Bạn chưa lưu địa chỉ giao hàng nào</Typography>
          <Typography sx={{ fontSize: 13.5, color: C.muted, maxWidth: 420, mx: 'auto', mb: 3, lineHeight: 1.6 }}>
            Thêm địa chỉ nhận hàng để thanh toán nhanh hơn và theo dõi đơn hàng chính xác.
          </Typography>
          <Button startIcon={<PlusOutlined />} onClick={handleAddAddress} sx={primaryButtonSx}>
            Thêm địa chỉ giao hàng
          </Button>
        </Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2.5 }}>
          {addresses.map((a) => (
            <Box
              key={a.addressId}
              sx={{
                bgcolor: C.surface,
                borderRadius: '20px',
                border: a.isDefault ? `2px solid ${C.cyan}` : `1px solid ${C.border}`,
                boxShadow: 'none',
                px: { xs: 2, sm: 2.5 },
                py: { xs: 1.75, sm: 2 },
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                  <Box>
                    <Typography sx={{ fontWeight: 800, fontSize: 15.5, color: '#0F172A', lineHeight: 1.25 }}>
                      {a.recipientName}
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.25 }}>{a.phone}</Typography>
                  </Box>

                  {a.isDefault && (
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        bgcolor: '#FEF9C3',
                        color: '#854D0E',
                        px: 1.25,
                        py: 0.3,
                        borderRadius: 99,
                        fontSize: 11.5,
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

                <Box sx={{ mt: 1.25, mb: 0.5 }}>
                  <Typography sx={{ fontSize: 14, color: '#0F172A', fontWeight: 700, mb: 0.25 }}>
                    {a.addressDetail}
                  </Typography>
                  <Typography sx={{ fontSize: 13, color: C.muted, lineHeight: 1.45 }}>
                    {a.wardName}, {a.provinceName}
                  </Typography>
                </Box>
              </Box>

              <Box sx={{ mt: 1 }}>
                <Divider sx={{ my: 1.25, borderColor: '#F1F5F9' }} />

                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {a.isDefault ? (
                    <Typography sx={{ fontSize: 12, color: '#94A3B8' }}>Ưu tiên khi thanh toán</Typography>
                  ) : (
                    <Box />
                  )}

                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Box
                      component="button"
                      type="button"
                      onClick={() => navigate(`/addresses/${a.addressId}/edit`)}
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.5,
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#0F172A',
                        bgcolor: 'transparent',
                        border: 0,
                        p: 0,
                        cursor: 'pointer',
                        transition: 'color 0.15s ease',
                        '&:hover': { color: C.cyan }
                      }}
                    >
                      <EditOutlined style={{ fontSize: 13 }} />
                      Chỉnh sửa
                    </Box>

                    {!a.isDefault && (
                      <Box
                        component="button"
                        type="button"
                        onClick={() => setTarget(a)}
                        sx={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 0.5,
                          fontSize: 13,
                          fontWeight: 600,
                          color: '#FF6B60',
                          bgcolor: 'transparent',
                          border: 0,
                          p: 0,
                          cursor: 'pointer',
                          transition: 'color 0.15s ease',
                          '&:hover': { color: '#FF3527' }
                        }}
                      >
                        <DeleteOutlined style={{ fontSize: 13 }} />
                        Xóa
                      </Box>
                    )}
                  </Box>
                </Box>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      <Dialog
        open={limitAlert}
        onClose={() => setLimitAlert(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '24px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 17 }}>Đã đạt giới hạn địa chỉ</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: C.muted, lineHeight: 1.6 }}>
            Bạn đã lưu tối đa <strong>{MAX_ADDRESSES} địa chỉ giao hàng</strong>. Vui lòng xóa bớt địa chỉ không còn sử dụng để thêm địa chỉ mới.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setLimitAlert(false)} sx={primaryButtonSx}>
            Đóng
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={Boolean(target)}
        onClose={() => !deleting && setTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: '24px', p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 17 }}>Xóa địa chỉ giao hàng?</DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: C.muted }}>
            Bạn có chắc muốn xóa địa chỉ của <strong>{target?.recipientName}</strong> không?
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setTarget(null)}
            disabled={deleting}
            sx={{
              ...outlineButtonSx,
              "&:hover": { bgcolor: C.surface, borderColor: C.border, color: "#374151" }
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={confirmDelete}
            disabled={deleting}
            sx={{
              ...outlineButtonSx,
              borderColor: "#F2A3A3",
              color: C.error,
              "&:hover": { bgcolor: C.surface, borderColor: "#F2A3A3", color: C.error }
            }}
          >
            {deleting ? "Đang xóa..." : "Xóa địa chỉ"}
          </Button>
        </DialogActions>
      </Dialog>
    </StoreAccountShell>
  );
}

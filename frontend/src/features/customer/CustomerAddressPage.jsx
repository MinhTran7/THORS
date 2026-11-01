import React, { useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Divider
} from '@mui/material';
import {
  PhoneOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EnvironmentOutlined,
  CloseOutlined,
  StarFilled,
  InfoCircleOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useCrumbs } from '../../layouts/crumbs';
import {
  getShippingAddresses,
  deleteShippingAddress
} from '../../services/shippingAddressService';

const C = {
  cyan: '#8EECF5',
  cyanHover: '#76dced',
  cream: '#FFF7AE',
  creamText: '#713F12',
  text: '#1E293B',
  muted: '#64748B',
  border: '#E2E8F0',
  borderLight: '#F1F5F9',
  surface: '#FFFFFF',
  bg: '#F8FAFC'
};

export default function CustomerAddressPage() {
  useCrumbs(['Tài khoản', 'Địa chỉ của tôi']);
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Modal xác nhận xóa
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null);

  // Modal thông báo không thể xóa địa chỉ mặc định
  const [cannotDeleteDefaultOpen, setCannotDeleteDefaultOpen] = useState(false);

  async function loadAddresses() {
    try {
      setLoading(true);
      setError('');
      const data = await getShippingAddresses();
      setAddresses(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách địa chỉ giao hàng.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAddresses();
  }, []);

  // Xử lý click nút xóa địa chỉ
  function handleDeleteClick(addr) {
    if (addr.isDefault) {
      setCannotDeleteDefaultOpen(true);
    } else {
      setDeleteConfirmTarget(addr);
    }
  }

  // Xử lý xóa địa chỉ
  async function handleConfirmDelete() {
    if (!deleteConfirmTarget) return;
    try {
      setActionLoading(true);
      await deleteShippingAddress(deleteConfirmTarget.addressId);
      setDeleteConfirmTarget(null);
      await loadAddresses();
    } catch (err) {
      console.error('Không thể xóa địa chỉ:', err);
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <Box sx={{ maxWidth: 880, mx: 'auto', color: C.text, pb: 6 }}>
      {/* ─── TIÊU ĐỀ TRÊN CÙNG & NÚT THÊM ĐỊA CHỈ ─── */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
          mb: 3
        }}
      >
        <Typography variant="h3" sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: 22, sm: 26 } }}>
          Địa chỉ của tôi
        </Typography>

        <Button
          variant="contained"
          startIcon={<PlusOutlined style={{ fontSize: 13, fontWeight: 700 }} />}
          onClick={() => navigate('/addresses/new')}
          disabled={addresses.length >= 5}
          sx={{
            bgcolor: C.cyan,
            color: '#0F172A',
            fontWeight: 700,
            fontSize: 13.5,
            px: 2.75,
            py: 1,
            borderRadius: 2.5,
            textTransform: 'none',
            boxShadow: 'none',
            '&:hover': {
              bgcolor: C.cyanHover,
              boxShadow: '0 4px 12px rgba(142, 236, 245, 0.45)'
            },
            '&.Mui-disabled': {
              bgcolor: '#E2E8F0',
              color: '#94A3B8'
            }
          }}
        >
          Thêm địa chỉ mới
        </Button>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
          <CircularProgress size={36} sx={{ color: C.cyan }} />
        </Box>
      ) : addresses.length === 0 ? (
        /* ─── TRẠNG THÁI RỖNG (EMPTY STATE) ─── */
        <Box
          sx={{
            bgcolor: C.surface,
            borderRadius: 3.5,
            border: `1px solid ${C.border}`,
            p: { xs: 4, md: 8 },
            textAlign: 'center',
            boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
          }}
        >
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

          <Typography sx={{ fontSize: 18, fontWeight: 800, color: C.text, mb: 1 }}>
            Bạn chưa lưu địa chỉ giao hàng nào
          </Typography>
          <Typography sx={{ fontSize: 13.5, color: C.muted, maxWidth: 420, mx: 'auto', mb: 3, lineHeight: 1.6 }}>
            Thêm địa chỉ nhận hàng để thanh toán nhanh hơn và theo dõi đơn hàng chính xác.
          </Typography>

          <Button
            variant="contained"
            startIcon={<PlusOutlined style={{ fontSize: 13, fontWeight: 700 }} />}
            onClick={() => navigate('/addresses/new')}
            sx={{
              bgcolor: C.cyan,
              color: '#0F172A',
              fontWeight: 700,
              fontSize: 13.5,
              px: 3,
              py: 1,
              borderRadius: 2.5,
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': {
                bgcolor: C.cyanHover,
                boxShadow: '0 4px 12px rgba(142, 236, 245, 0.45)'
              }
            }}
          >
            Thêm địa chỉ giao hàng
          </Button>
        </Box>
      ) : (
        /* ─── DANH SÁCH THẺ ĐỊA CHỈ ─── */
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {addresses.map((addr) => {
            const administrativeLine = [addr.wardName, addr.districtName, addr.provinceName]
              .filter(Boolean)
              .join(', ');

            return (
              <Box
                key={addr.addressId}
                sx={{
                  bgcolor: C.surface,
                  borderRadius: 3,
                  border: `1.5px solid ${addr.isDefault ? '#8EECF5' : '#E2E8F0'}`,
                  boxShadow: addr.isDefault
                    ? '0 2px 10px rgba(142, 236, 245, 0.15)'
                    : '0 1px 3px rgba(0, 0, 0, 0.02)',
                  p: { xs: 2.5, sm: 3 },
                  transition: 'all 0.2s ease',
                  '&:hover': {
                    borderColor: addr.isDefault ? C.cyanHover : '#CBD5E1',
                    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.05)'
                  }
                }}
              >
                {/* Phần trên: Tên + SĐT + Badge Mặc định */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2 }}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                      <Typography sx={{ fontWeight: 800, fontSize: 16, color: '#0F172A' }}>
                        {addr.recipientName}
                      </Typography>
                      <Typography sx={{ color: '#CBD5E1', fontSize: 13 }}>|</Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.6, color: '#64748B', fontSize: 13.5 }}>
                        <PhoneOutlined style={{ fontSize: 12.5, color: '#94A3B8' }} />
                        <span>{addr.phone}</span>
                      </Box>
                    </Box>

                    {/* Địa chỉ chi tiết (Số nhà, ngõ/đường) */}
                    <Typography sx={{ fontSize: 14.5, color: '#334155', fontWeight: 500, mt: 1 }}>
                      {addr.addressDetail}
                    </Typography>

                    {/* Cấp hành chính (Phường, Quận, Tỉnh) */}
                    <Typography sx={{ fontSize: 13, color: '#64748B', mt: 0.4 }}>
                      {administrativeLine}
                    </Typography>
                  </Box>

                  {/* Badge Mặc định */}
                  {addr.isDefault && (
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
                      <span>Mặc định</span>
                    </Box>
                  )}
                </Box>

                <Divider sx={{ my: 2, borderColor: '#F1F5F9' }} />

                {/* Phần dưới: Thiết lập mặc định bên trái + Chỉnh sửa / Xóa bên phải */}
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    alignItems: 'center',
                    gap: 2
                  }}
                >
                  <Box
                    component="button"
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/addresses/${addr.addressId}/edit`);
                    }}
                      sx={{
                        background: 'none',
                        border: 'none',
                        outline: 'none',
                        boxShadow: 'none',
                        p: '4px 8px',
                        m: 0,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.6,
                        fontFamily: 'inherit',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#475569',
                        borderRadius: 1.5,
                        transition: 'all 0.15s ease',
                        WebkitTapHighlightColor: 'transparent',
                        userSelect: 'none',
                        '&:hover': {
                          bgcolor: '#F1F5F9',
                          color: '#0284C7'
                        },
                        '&:focus, &:focus-visible, &:active': {
                          outline: 'none',
                          boxShadow: 'none',
                          background: 'transparent'
                        }
                      }}
                    >
                      <EditOutlined style={{ fontSize: 13 }} />
                      <span>Chỉnh sửa</span>
                    </Box>

                    <Box
                      component="button"
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(addr);
                      }}
                      sx={{
                        background: 'none',
                        border: 'none',
                        outline: 'none',
                        boxShadow: 'none',
                        p: '4px 8px',
                        m: 0,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 0.6,
                        fontFamily: 'inherit',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#EF4444',
                        borderRadius: 1.5,
                        transition: 'all 0.15s ease',
                        WebkitTapHighlightColor: 'transparent',
                        userSelect: 'none',
                        '&:hover': {
                          bgcolor: '#FEF2F2',
                          color: '#DC2626'
                        },
                        '&:focus, &:focus-visible, &:active': {
                          outline: 'none',
                          boxShadow: 'none',
                          background: 'transparent'
                        }
                      }}
                    >
                      <DeleteOutlined style={{ fontSize: 13 }} />
                      <span>Xóa</span>
                    </Box>
                </Box>
              </Box>
            );
          })}
        </Box>
      )}

      {/* MODAL XÁC NHẬN XÓA */}
      <Dialog
        open={Boolean(deleteConfirmTarget)}
        onClose={() => setDeleteConfirmTarget(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3.5, p: 1 } }}
      >
        <DialogTitle sx={{ fontWeight: 800, fontSize: 17, color: C.text }}>
          Xóa địa chỉ giao hàng?
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: 14, color: C.muted }}>
            Bạn có chắc chắn muốn xóa địa chỉ của <strong>{deleteConfirmTarget?.recipientName}</strong> không?
            Hành động này không thể hoàn tác.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
          <Button
            onClick={() => setDeleteConfirmTarget(null)}
            disabled={actionLoading}
            sx={{
              textTransform: 'none',
              fontWeight: 600,
              color: C.text,
              borderRadius: 2,
              border: `1px solid ${C.border}`
            }}
          >
            Hủy
          </Button>
          <Button
            onClick={handleConfirmDelete}
            disabled={actionLoading}
            sx={{
              bgcolor: '#FEE2E2',
              color: '#DC2626',
              fontWeight: 700,
              textTransform: 'none',
              borderRadius: 2,
              px: 2.5,
              '&:hover': { bgcolor: '#FCA5A5' }
            }}
          >
            {actionLoading ? 'Đang xóa...' : 'Xóa địa chỉ'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* POPUP BÁO KHÔNG THỂ XÓA ĐỊA CHỈ MẶC ĐỊNH */}
      <Dialog
        open={cannotDeleteDefaultOpen}
        onClose={() => setCannotDeleteDefaultOpen(false)}
        maxWidth="xs"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3.5,
            p: 1.5,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)'
          }
        }}
      >
        <DialogTitle sx={{ pb: 1, pt: 1.5, px: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Box
              sx={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                bgcolor: '#FEF3C7',
                color: '#D97706',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <InfoCircleOutlined style={{ fontSize: 20 }} />
            </Box>
            <Typography sx={{ fontWeight: 800, fontSize: 16.5, color: C.text }}>
              Thông báo
            </Typography>
          </Box>
          <IconButton
            size="small"
            onClick={() => setCannotDeleteDefaultOpen(false)}
            sx={{ color: C.muted, p: 0.5, '&:hover': { bgcolor: '#F1F5F9' } }}
          >
            <CloseOutlined style={{ fontSize: 14 }} />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ px: 2, pt: 1, pb: 2 }}>
          <Typography sx={{ fontSize: 14, color: '#334155', lineHeight: 1.6 }}>
            Bạn không thể xóa địa chỉ mặc định. Nếu muốn xóa địa chỉ này, hãy chọn địa chỉ khác làm mặc định.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ px: 2, pb: 1.5, pt: 0, justifyContent: 'flex-end' }}>
          <Button
            onClick={() => setCannotDeleteDefaultOpen(false)}
            sx={{
              bgcolor: C.cyan,
              color: '#0F172A',
              fontWeight: 700,
              fontSize: 13.5,
              px: 3,
              py: 0.85,
              borderRadius: 2.5,
              textTransform: 'none',
              boxShadow: 'none',
              '&:hover': {
                bgcolor: C.cyanHover,
                boxShadow: '0 2px 8px rgba(142, 236, 245, 0.4)'
              }
            }}
          >
            Đã hiểu
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

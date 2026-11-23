import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Typography } from '@mui/material';
import { useCrumbs } from 'layouts/crumbs';
import { StoreAccountShell } from 'features/account/components/StoreAccount';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from 'features/customer/theme';
import { deleteMyTryOnPhotos, getTryOnHistory } from './api';

const MODE_LABELS = { MODEL: 'Người mẫu', GENERATE: 'AI tạo người mẫu', PHOTO: 'Ảnh của bạn' };

// Giờ từ máy chủ là UTC (không có múi giờ) -> hiển thị theo giờ máy khách
const toLocal = (utc) => (utc ? new Date(`${utc}Z`) : null);
const fmt = (d) =>
  d ? d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

/**
 * "Ảnh mặc thử của tôi": xem lại các lần mặc thử bằng AI còn ảnh (ảnh của bạn tự xóa sau 24 giờ,
 * ảnh trên người mẫu giữ lâu hơn). Bấm ảnh để xem lớn.
 */
export default function TryOnHistoryPage() {
  useCrumbs(['Tài khoản', 'Ảnh mặc thử của tôi']);
  const [jobs, setJobs] = useState(null);
  const [error, setError] = useState('');
  const [viewing, setViewing] = useState(null);
  const [confirm, setConfirm] = useState(false);

  const load = () =>
    getTryOnHistory()
      .then(setJobs)
      .catch((e) => {
        setJobs([]);
        setError(e.message);
      });

  useEffect(() => {
    load();
  }, []);

  // Còn lần đang vẽ thì tự tải lại sau ít giây
  useEffect(() => {
    if (!jobs?.some((j) => j.status === 'PENDING' || j.status === 'RUNNING')) return undefined;
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [jobs]);

  const removeAll = async () => {
    setConfirm(false);
    try {
      await deleteMyTryOnPhotos();
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <StoreAccountShell
      title="Ảnh mặc thử của tôi"
      subtitle="Các lần mặc thử bằng AI. Ảnh của bạn tự xóa sau 24 giờ; ảnh trên người mẫu được giữ lâu hơn."
    >
      {error && <Typography sx={{ color: C.error, fontSize: 13.5, mb: 2 }}>{error}</Typography>}

      {jobs === null ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={34} sx={{ color: C.teal }} />
        </Box>
      ) : jobs.length === 0 ? (
        <Box sx={{ ...cardSx, p: 4, textAlign: 'center' }}>
          <Typography sx={{ color: C.muted, mb: 2 }}>Bạn chưa có ảnh mặc thử nào (hoặc ảnh đã hết hạn).</Typography>
          <Button component={RouterLink} to="/outfit" sx={primaryButtonSx}>
            Phối đồ và mặc thử
          </Button>
        </Box>
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2.5 }}>
            {jobs.map((j) => {
              const running = j.status === 'PENDING' || j.status === 'RUNNING';
              return (
                <Box key={j.jobId} sx={{ ...cardSx, borderRadius: '18px', overflow: 'hidden' }}>
                  <Box
                    onClick={() => !running && j.resultImageUrl && setViewing(j)}
                    sx={{
                      aspectRatio: '3 / 4',
                      bgcolor: '#F3F4F6',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: running ? 'default' : 'zoom-in'
                    }}
                  >
                    {running ? (
                      <Box sx={{ textAlign: 'center' }}>
                        <CircularProgress size={28} sx={{ color: C.teal }} />
                        <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 1 }}>AI đang vẽ…</Typography>
                      </Box>
                    ) : (
                      <Box
                        component="img"
                        src={j.resultImageUrl}
                        alt="Ảnh mặc thử"
                        sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                  </Box>
                  <Box sx={{ p: 1.5 }}>
                    <Typography sx={{ fontSize: 12, color: C.muted }}>
                      {MODE_LABELS[j.mode] || j.mode} · {fmt(toLocal(j.createdAt))}
                      {j.mock ? ' · ảnh mẫu' : ''}
                    </Typography>
                    {j.items.map((i) => (
                      <Typography key={i.productId} sx={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35 }}>
                        <Box
                          component={RouterLink}
                          to={`/shop/products/${i.productId}`}
                          sx={{ color: C.text, textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}
                        >
                          {i.productName}
                        </Box>
                      </Typography>
                    ))}
                    <Typography sx={{ fontSize: 11.5, color: C.muted, mt: 0.5 }}>Tự xóa lúc {fmt(toLocal(j.expiresAt))}</Typography>
                  </Box>
                </Box>
              );
            })}
          </Box>
          <Button onClick={() => setConfirm(true)} sx={{ ...outlineButtonSx, color: C.error, mt: 3 }}>
            Xóa ảnh của tôi
          </Button>
        </>
      )}

      {/* Xem ảnh lớn */}
      <Dialog open={Boolean(viewing)} onClose={() => setViewing(null)} maxWidth="sm" fullWidth>
        {viewing && (
          <DialogContent sx={{ p: 1.5, position: 'relative' }}>
            <IconButton
              onClick={() => setViewing(null)}
              aria-label="Đóng"
              sx={{ position: 'absolute', top: 12, right: 12, bgcolor: '#fff' }}
            >
              ✕
            </IconButton>
            <Box
              component="img"
              src={viewing.resultImageUrl}
              alt="Ảnh mặc thử"
              sx={{ width: '100%', display: 'block', borderRadius: '12px' }}
            />
            <Typography sx={{ fontSize: 13.5, mt: 1 }}>{viewing.items.map((i) => i.productName).join(' + ')}</Typography>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={confirm} onClose={() => setConfirm(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Xóa ảnh của bạn?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: C.muted, fontSize: 14 }}>
            Ảnh bạn tải lên, ảnh mặc thử từ ảnh của bạn và ảnh AI tạo người mẫu sẽ bị xóa ngay. Ảnh mặc thử trên người mẫu của cửa hàng vẫn
            được giữ.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirm(false)} sx={outlineButtonSx}>
            Quay lại
          </Button>
          <Button onClick={removeAll} sx={{ ...primaryButtonSx, bgcolor: C.error, color: '#fff', '&:hover': { bgcolor: '#B83737' } }}>
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </StoreAccountShell>
  );
}

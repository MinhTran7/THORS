import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Switch,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import { DeleteOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { C, cardSx, outlineButtonSx, primaryButtonSx } from 'features/customer/theme';
import { BODY_LABELS, GENDER_LABELS, createTryOnModel, deleteTryOnModel, listTryOnModels, setTryOnModelActive } from './api';

const EMPTY = { gender: 'FEMALE', bodyType: 'REGULAR', heightCm: '', source: 'UPLOAD', note: '' };
const SOURCES = { UPLOAD: 'Ảnh tự chụp', AI: 'Ảnh AI tạo' };

const labelSx = { fontSize: 13, fontWeight: 600, mb: 0.75, color: C.text };
const switchSx = {
  width: 34,
  height: 18,
  p: 0,
  '& .MuiSwitch-switchBase': { p: '2px', '&.Mui-checked': { transform: 'translateX(16px)' } },
  '& .MuiSwitch-thumb': { width: 14, height: 14, boxShadow: 'none', bgcolor: '#fff' },
  '& .Mui-checked .MuiSwitch-thumb': { bgcolor: '#67E8F9' },
  '& .MuiSwitch-track': { borderRadius: 9, bgcolor: '#CBD5E1', opacity: '1 !important' },
  '& .Mui-checked + .MuiSwitch-track': { bgcolor: '#BAF2F8' }
};

function Choice({ options, value, onChange }) {
  return (
    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {Object.entries(options).map(([key, label]) => (
        <Button
          key={key}
          onClick={() => onChange(key)}
          sx={{
            ...outlineButtonSx,
            height: 38,
            fontSize: 13.5,
            ...(value === key && { bgcolor: C.cyan, borderColor: C.cyan, color: C.cyanInk })
          }}
        >
          {label}
        </Button>
      ))}
    </Box>
  );
}

/**
 * Chủ cửa hàng quản lý người mẫu dựng sẵn cho "Mặc thử bằng AI" (chế độ "Người mẫu dáng giống bạn").
 * Hệ thống tự chọn người mẫu theo số đo của khách (giới tính, dáng theo BMI, chiều cao gần nhất).
 */
export default function TryOnModelsPage() {
  useCrumbs(['Sản phẩm', 'Người mẫu thử đồ']);
  const [models, setModels] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [image, setImage] = useState(null); // { file, url }
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [confirm, setConfirm] = useState(null); // người mẫu đang hỏi xóa
  const fileRef = useRef(null);

  const load = () =>
    listTryOnModels()
      .then(setModels)
      .catch((e) => {
        setModels([]);
        setMessage({ type: 'error', text: e.message });
      });

  useEffect(() => {
    load();
  }, []);

  useEffect(() => () => image && URL.revokeObjectURL(image.url), [image]);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    const height = Number(form.heightCm);
    if (!image) return setMessage({ type: 'error', text: 'Hãy chọn ảnh toàn thân của người mẫu.' });
    if (!(height >= 120 && height <= 220)) return setMessage({ type: 'error', text: 'Chiều cao phải từ 120 đến 220 cm.' });
    if (!form.note.trim()) return setMessage({ type: 'error', text: 'Hãy ghi nguồn ảnh / giấy phép.' });
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      await createTryOnModel({ ...form, heightCm: height, image: image.file });
      setForm(EMPTY);
      setImage(null);
      setMessage({ type: 'success', text: 'Đã thêm người mẫu.' });
      load();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (m) => {
    try {
      const updated = await setTryOnModelActive(m.modelId, !m.active);
      setModels((list) => list.map((x) => (x.modelId === m.modelId ? updated : x)));
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  const remove = async () => {
    const m = confirm;
    setConfirm(null);
    try {
      await deleteTryOnModel(m.modelId);
      setModels((list) => list.filter((x) => x.modelId !== m.modelId));
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    }
  };

  return (
    <Box>
      <Typography sx={{ fontWeight: 800, color: '#0F172A', fontSize: { xs: 22, sm: 26 } }}>Người mẫu thử đồ</Typography>
      <Typography sx={{ color: C.muted, fontSize: 14, mb: 3 }}>
        Ảnh người mẫu dùng cho “Mặc thử bằng AI”. Khách không cần tải ảnh của mình: hệ thống chọn người mẫu cùng giới tính, dáng và chiều
        cao gần nhất với số đo của khách. Nên có đủ dáng gầy / vừa / đầy đặn cho cả nam và nữ.
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '420px 1fr' }, gap: 3, alignItems: 'start' }}>
        {/* Thêm người mẫu */}
        <Box sx={{ ...cardSx, p: 3 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 800, mb: 2 }}>Thêm người mẫu</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 2, mb: 2 }}>
            <Box
              onClick={() => fileRef.current?.click()}
              sx={{
                aspectRatio: '3 / 4',
                borderRadius: '14px',
                border: `1.5px dashed ${C.border}`,
                bgcolor: '#FAFDFD',
                display: 'grid',
                placeItems: 'center',
                overflow: 'hidden',
                cursor: 'pointer'
              }}
            >
              {image ? (
                <Box component="img" src={image.url} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <Typography sx={{ fontSize: 12.5, color: C.muted, textAlign: 'center', px: 1 }}>Chọn ảnh toàn thân (JPG / PNG)</Typography>
              )}
            </Box>
            <Box sx={{ fontSize: 12.5, color: C.muted }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: C.text, mb: 0.5 }}>Ảnh tốt</Typography>
              <Box component="ul" sx={{ m: 0, pl: 2 }}>
                <li>Đứng thẳng, nhìn thẳng, thấy cả người</li>
                <li>Mặc đồ ôm gọn (áo thun, quần legging)</li>
                <li>Nền trơn, đủ sáng</li>
                <li>Được phép sử dụng (người mẫu đồng ý)</li>
              </Box>
            </Box>
          </Box>

          <Typography sx={labelSx}>Giới tính</Typography>
          <Choice options={GENDER_LABELS} value={form.gender} onChange={(v) => set('gender', v)} />
          <Typography sx={{ ...labelSx, mt: 2 }}>Dáng</Typography>
          <Choice options={BODY_LABELS} value={form.bodyType} onChange={(v) => set('bodyType', v)} />
          <Typography sx={{ ...labelSx, mt: 2 }}>Chiều cao (cm)</Typography>
          <TextField
            size="small"
            value={form.heightCm}
            onChange={(e) => set('heightCm', e.target.value.replace(/\D/g, '').slice(0, 3))}
            placeholder="vd 160"
            sx={{ width: 140 }}
          />
          <Typography sx={{ ...labelSx, mt: 2 }}>Nguồn ảnh</Typography>
          <Choice options={SOURCES} value={form.source} onChange={(v) => set('source', v)} />
          <Typography sx={{ ...labelSx, mt: 2 }}>Ghi chú nguồn / giấy phép</Typography>
          <TextField
            fullWidth
            size="small"
            multiline
            minRows={2}
            value={form.note}
            onChange={(e) => set('note', e.target.value.slice(0, 255))}
            placeholder="vd: Ảnh tự chụp, người mẫu Lan đồng ý cho shop sử dụng (18/11/2026)"
          />

          {message.text && (
            <Typography sx={{ mt: 2, fontSize: 13.5, fontWeight: 600, color: message.type === 'error' ? C.error : C.teal }}>
              {message.text}
            </Typography>
          )}
          <Button onClick={save} disabled={saving} sx={{ ...primaryButtonSx, mt: 2.5 }}>
            {saving ? 'Đang tải lên…' : 'Thêm người mẫu'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setImage({ file, url: URL.createObjectURL(file) });
              e.target.value = '';
            }}
          />
        </Box>

        {/* Danh sách */}
        <Box>
          {models === null ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress size={32} sx={{ color: C.teal }} />
            </Box>
          ) : models.length === 0 ? (
            <Box sx={{ ...cardSx, p: 4, textAlign: 'center', color: C.muted }}>Chưa có người mẫu nào.</Box>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 2 }}>
              {models.map((m) => (
                <Box key={m.modelId} sx={{ ...cardSx, borderRadius: '18px', overflow: 'hidden', opacity: m.active ? 1 : 0.6 }}>
                  <Box sx={{ aspectRatio: '3 / 4', bgcolor: '#F3F4F6' }}>
                    <Box component="img" src={m.imageUrl} alt="" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </Box>
                  <Box sx={{ p: 1.5 }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 14 }}>
                      {GENDER_LABELS[m.gender]} · {BODY_LABELS[m.bodyType]} · {m.heightCm} cm
                    </Typography>
                    <Tooltip title={m.note || ''}>
                      <Typography sx={{ fontSize: 12, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {SOURCES[m.source]} · {m.note}
                      </Typography>
                    </Tooltip>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mt: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Switch checked={m.active} onChange={() => toggle(m)} sx={switchSx} />
                        <Typography sx={{ fontSize: 12.5, color: C.muted }}>{m.active ? 'Đang dùng' : 'Đang ẩn'}</Typography>
                      </Box>
                      <Tooltip title="Xóa người mẫu">
                        <IconButton size="small" onClick={() => setConfirm(m)} sx={{ color: '#64748B', '&:hover': { color: '#EF4444' } }}>
                          <DeleteOutlined style={{ fontSize: 17 }} />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Box>

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 800 }}>Xóa người mẫu?</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: C.muted, fontSize: 14 }}>
            Ảnh người mẫu và các ảnh mặc thử đã tạo trên người mẫu này sẽ bị xóa. Muốn tạm ngừng thì chỉ cần tắt “Đang dùng”.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setConfirm(null)} sx={outlineButtonSx}>
            Quay lại
          </Button>
          <Button onClick={remove} sx={{ ...primaryButtonSx, bgcolor: C.error, color: '#fff', '&:hover': { bgcolor: '#B83737' } }}>
            Xóa
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

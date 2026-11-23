import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Checkbox, CircularProgress, Dialog, DialogContent, FormControlLabel, IconButton, Typography } from '@mui/material';
import { C, SERIF } from 'features/shop/storeTheme';
import { BODY_LABELS, GENDER_LABELS, createTryOnJob, deleteMyTryOnPhotos, getTryOnJob, getTryOnModels, getTryOnQuota } from './api';
import { captureVideo, normalizeFile } from './photo';

const POLL_MS = 2500;
// Lần thử gần nhất (để "dùng lại ảnh lần trước" khi đổi món) - chỉ lưu id job, không lưu ảnh
const LAST_JOB_KEY = 'thors.tryon.lastJob';

const readLastJob = () => {
  try {
    return Number(sessionStorage.getItem(LAST_JOB_KEY)) || null;
  } catch {
    return null;
  }
};
const writeLastJob = (id) => {
  try {
    if (id) sessionStorage.setItem(LAST_JOB_KEY, String(id));
    else sessionStorage.removeItem(LAST_JOB_KEY);
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua */
  }
};

const buttonSx = (primary) => ({
  borderRadius: '12px',
  textTransform: 'none',
  fontWeight: 700,
  px: 2.5,
  border: `1.5px solid ${C.ink}`,
  bgcolor: primary ? C.ink : '#fff',
  color: primary ? '#fff' : C.ink,
  '&:hover': { bgcolor: primary ? '#333' : C.sand },
  '&.Mui-disabled': { bgcolor: primary ? '#bbb' : '#fff', color: primary ? '#fff' : '#aaa', borderColor: '#ccc' }
});

// Kết quả đã thử theo bộ món (khóa = id sản phẩm đã sắp xếp) -> id lần thử, để mở lại là thấy ngay.
// Chỉ lưu id trong phiên trình duyệt (đóng tab là quên), ảnh vẫn nằm ở máy chủ và tự xóa theo hạn.
const RESULTS_KEY = 'thors.tryon.results';
const itemsKey = (list) =>
  list
    .map((i) => i.productId)
    .sort((a, b) => a - b)
    .join(',');
const readResults = () => {
  try {
    return JSON.parse(sessionStorage.getItem(RESULTS_KEY) || '{}');
  } catch {
    return {};
  }
};
const writeResult = (key, jobId) => {
  try {
    const all = readResults();
    if (jobId) all[key] = jobId;
    else delete all[key];
    sessionStorage.setItem(RESULTS_KEY, JSON.stringify(all));
  } catch {
    /* trình duyệt chặn lưu trữ: bỏ qua */
  }
};
const clearResults = () => {
  try {
    sessionStorage.removeItem(RESULTS_KEY);
  } catch {
    /* bỏ qua */
  }
};

// AI chưa vẽ được giày dép / phụ kiện (role từ trang Phối đồ; không có role = món lẻ ở trang sản phẩm)
const canTry = (item) => !['SHOES', 'ACCESSORY'].includes(item.role);

// 3 cách mặc thử. GENERATE chỉ mặc được 1 món mỗi lần.
const MODES = [
  { key: 'MODEL', label: 'Người mẫu dáng giống bạn' },
  { key: 'GENERATE', label: 'AI tạo người mẫu', single: true },
  { key: 'PHOTO', label: 'Ảnh của tôi' }
];

/**
 * Hộp thoại "Mặc thử bằng AI" (ảnh 2D).
 * items: [{ productId, productName, imageUrl, role? }] - 1 món (trang sản phẩm) hoặc cả bộ (trang Phối đồ).
 *   Cả bộ: khách tích chọn món muốn mặc thử (giày dép / phụ kiện AI chưa vẽ được nên không chọn được).
 * extraActions (không bắt buộc): nút thêm ở màn hình kết quả, vd "Thêm cả bộ vào giỏ".
 *
 * Chế độ: người mẫu dựng sẵn (chọn theo số đo, mặc định) | AI tạo người mẫu | ảnh của khách (phải đồng ý).
 * Các bước: chọn người mẫu / ảnh -> gửi -> chờ (hỏi trạng thái mỗi 2,5 giây) -> xem ảnh kết quả.
 */
export default function TryOnDialog({ open, onClose, items: allItems, extraActions }) {
  // Món được tích chọn để mặc thử (mặc định: mọi món AI vẽ được)
  const [selectedIds, setSelectedIds] = useState(() => allItems.filter(canTry).map((i) => i.productId));
  const items = allItems.filter((i) => selectedIds.includes(i.productId));
  const toggleItem = (id) => setSelectedIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const [mode, setMode] = useState('MODEL');
  const [choice, setChoice] = useState(null); // { models, suggestedModelId, gender, generateDescription }
  const [modelId, setModelId] = useState(null);
  const [quota, setQuota] = useState(null);
  const [step, setStep] = useState('setup'); // setup | camera | running | result
  const [photo, setPhoto] = useState(null); // { blob, url } ảnh mới
  const [useLast, setUseLast] = useState(false);
  const [lastJob, setLastJob] = useState(null);
  const [consent, setConsent] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  // Bộ đồ lần mở trước (đổi bộ thì mới chọn lại món từ đầu)
  const outfitKeyRef = useRef(null);

  // Mở hộp thoại: lấy số lượt + kiểm tra ảnh lần trước còn dùng được không
  // + hiện lại kết quả đã thử của đúng các món này (không phải đợi AI vẽ lại)
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const outfitKey = itemsKey(allItems);
    const selection = outfitKeyRef.current === outfitKey ? selectedIds : allItems.filter(canTry).map((i) => i.productId);
    outfitKeyRef.current = outfitKey;
    setSelectedIds(selection);
    setError('');
    const savedJobId = readResults()[itemsKey(allItems.filter((i) => selection.includes(i.productId)))];
    if (savedJobId) {
      getTryOnJob(savedJobId)
        .then((j) => {
          if (!alive) return;
          if (j.status === 'FAILED') {
            setStep('setup');
            setJob(null);
            return;
          }
          setJob({ ...j, skipped: [] });
          setStep(j.status === 'DONE' ? 'result' : 'running');
        })
        .catch(() => {
          if (!alive) return;
          setStep('setup');
          setJob(null);
        });
    } else {
      setStep('setup');
      setJob(null);
    }
    getTryOnQuota()
      .then((q) => alive && setQuota(q))
      .catch((e) => alive && setQuota({ failed: true, message: e.message }));
    // Người mẫu: chưa có ai thì mở sẵn tab "Ảnh của tôi"
    getTryOnModels()
      .then((c) => {
        if (!alive) return;
        setChoice(c);
        setModelId((id) => id ?? c.suggestedModelId ?? c.models[0]?.modelId ?? null);
        if (!c.models.length && !c.gender) setMode((m) => (m === 'MODEL' ? 'PHOTO' : m));
      })
      .catch(() => alive && setChoice({ models: [], failed: true }));
    const last = readLastJob();
    if (last) {
      getTryOnJob(last)
        .then((j) => {
          if (!alive) return;
          setLastJob(j.photoAvailable ? j : null);
          setUseLast((u) => u || (j.photoAvailable && !photo));
        })
        .catch(() => writeLastJob(null));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Hỏi trạng thái tới khi xong
  useEffect(() => {
    if (step !== 'running' || !job) return undefined;
    const timer = setInterval(async () => {
      try {
        const j = await getTryOnJob(job.jobId);
        if (j.status === 'DONE' || j.status === 'FAILED') {
          setJob((old) => ({ ...j, skipped: old?.skipped ?? [] }));
          setStep('result');
          if (j.photoAvailable) {
            writeLastJob(j.jobId);
            setLastJob(j);
          }
        }
      } catch (e) {
        setError(e.message);
        setStep('setup');
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [step, job]);

  // Giải phóng ảnh xem trước
  useEffect(() => () => photo && URL.revokeObjectURL(photo.url), [photo]);

  const pickFile = async (file) => {
    if (!file) return;
    setError('');
    try {
      const blob = await normalizeFile(file);
      setPhoto({ blob, url: URL.createObjectURL(blob) });
      setUseLast(false);
    } catch {
      setError('Không đọc được ảnh. Vui lòng chọn ảnh JPG hoặc PNG.');
    }
  };

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const j = await createTryOnJob({
        mode,
        modelId: mode === 'MODEL' ? modelId : null,
        photo: mode === 'PHOTO' && !useLast ? photo?.blob : null,
        photoFromJob: mode === 'PHOTO' && useLast ? lastJob?.jobId : null,
        productIds: items.map((i) => i.productId),
        consent: mode === 'PHOTO' && consent
      });
      setJob(j);
      writeResult(itemsKey(items), j.jobId); // mở lại hộp thoại là thấy kết quả / tiếp tục chờ
      if (j.status === 'DONE' || j.status === 'FAILED') {
        setStep('result');
      } else {
        setStep('running');
        setQuota((q) => (q && !q.failed ? { ...q, remaining: Math.max(0, q.remaining - 1) } : q));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const deletePhotos = async () => {
    setBusy(true);
    try {
      await deleteMyTryOnPhotos();
      writeLastJob(null);
      clearResults();
      setLastJob(null);
      setUseLast(false);
      setJob(null);
      setStep('setup');
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  // Đổi giới tính người mẫu (khách xem cả người mẫu khác giới tính với số đo đã lưu)
  const changeGender = async (gender) => {
    try {
      const c = await getTryOnModels(gender);
      setChoice(c);
      setModelId(c.suggestedModelId ?? c.models[0]?.modelId ?? null);
    } catch (e) {
      setError(e.message);
    }
  };

  const hasPhoto = useLast ? Boolean(lastJob) : Boolean(photo);
  const notReady = quota && (quota.failed || !quota.ready);
  const noTurns = quota && quota.ready && quota.remaining <= 0;
  // Phải chọn ít nhất 1 món; AI tạo người mẫu chỉ mặc đúng 1 món
  const modeReady =
    items.length > 0 &&
    (mode === 'MODEL'
      ? Boolean(modelId)
      : mode === 'GENERATE'
        ? items.length === 1 && Boolean(choice?.generateDescription)
        : hasPhoto && consent);

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogContent sx={{ p: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography sx={{ fontFamily: SERIF, fontSize: 24 }}>Mặc thử bằng AI</Typography>
            <Typography sx={{ fontSize: 13.5, color: C.muted }}>
              {items.length ? items.map((i) => i.productName).join(' + ') : 'Chưa chọn món nào'}
            </Typography>
          </Box>
          <IconButton onClick={onClose} disabled={busy} aria-label="Đóng">
            ✕
          </IconButton>
        </Box>

        {quota?.mock && (
          <Typography sx={{ fontSize: 12.5, bgcolor: '#FFF4C4', border: '1px solid #EFE3A0', borderRadius: '10px', p: 1, mb: 2 }}>
            Đang ở chế độ ảnh mẫu (chưa bật dịch vụ AI thật): kết quả là ảnh người mẫu / ảnh của bạn kèm ảnh món đồ, để thử luồng hoạt động.
          </Typography>
        )}

        {step === 'setup' && (
          <>
            {/* Chọn cách mặc thử */}
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
              {MODES.map((m) => {
                // Dịch vụ miễn phí (Leffa) không tự tạo người mẫu -> ẩn tab này
                if (m.key === 'GENERATE' && quota && quota.generateSupported === false) return null;
                const disabled = m.single && items.length > 1;
                return (
                  <Button
                    key={m.key}
                    disabled={disabled}
                    title={disabled ? 'AI tạo người mẫu chỉ mặc được 1 món mỗi lần' : undefined}
                    onClick={() => setMode(m.key)}
                    sx={{ ...buttonSx(mode === m.key), borderRadius: '999px', py: 0.5 }}
                  >
                    {m.label}
                  </Button>
                );
              })}
            </Box>
            <SetupStep
              {...{ mode, allItems, selectedIds, toggleItem, quota, photo, lastJob, useLast, setUseLast, consent, setConsent }}
              {...{ notReady, noTurns, busy }}
              {...{ choice, modelId, setModelId, changeGender }}
              onPickFile={() => fileRef.current?.click()}
              onCamera={() => setStep('camera')}
              canStart={modeReady && !notReady && !noTurns && !busy}
              onStart={start}
            />
          </>
        )}
        {step === 'camera' && (
          <CameraStep
            onCancel={() => setStep('setup')}
            onCaptured={(blob) => {
              setPhoto({ blob, url: URL.createObjectURL(blob) });
              setUseLast(false);
              setStep('setup');
            }}
          />
        )}
        {step === 'running' && (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <CircularProgress sx={{ color: C.ink }} />
            <Typography sx={{ fontWeight: 700, mt: 2 }}>AI đang mặc {items.length > 1 ? `${items.length} món` : 'đồ'} cho bạn…</Typography>
            <Typography sx={{ fontSize: 13, color: C.muted, mt: 0.5 }}>
              Thường mất 10–30 giây mỗi món. Bạn có thể đóng hộp thoại, kết quả vẫn được giữ trong {quota?.keepHours ?? 24} giờ.
            </Typography>
          </Box>
        )}
        {step === 'result' && job && (
          <ResultStep
            job={job}
            busy={busy}
            extraActions={extraActions}
            onAgain={() => {
              setStep('setup');
              setJob(null);
            }}
            onDelete={deletePhotos}
          />
        )}

        {error && <Typography sx={{ color: C.accent, fontSize: 13.5, mt: 2 }}>{error}</Typography>}

        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          hidden
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

/** Chọn người mẫu dựng sẵn: người mẫu gợi ý theo số đo được chọn sẵn, đổi được giới tính. */
function ModelPicker({ choice, modelId, setModelId, changeGender }) {
  if (!choice) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={28} sx={{ color: C.ink }} />
      </Box>
    );
  }
  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        {Object.entries(GENDER_LABELS).map(([key, label]) => (
          <Button
            key={key}
            size="small"
            onClick={() => changeGender(key)}
            sx={{ ...buttonSx(choice.gender === key), py: 0.25, minWidth: 0 }}
          >
            {label}
          </Button>
        ))}
      </Box>
      {choice.models.length === 0 ? (
        <Typography sx={{ fontSize: 13.5, color: C.muted }}>
          Cửa hàng chưa có người mẫu {choice.gender ? GENDER_LABELS[choice.gender].toLowerCase() : ''}. Bạn hãy chọn “AI tạo người mẫu” hoặc
          “Ảnh của tôi”.
        </Typography>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, maxHeight: 360, overflowY: 'auto', pr: 0.5 }}>
          {choice.models.map((m) => (
            <Box
              key={m.modelId}
              onClick={() => setModelId(m.modelId)}
              sx={{
                cursor: 'pointer',
                borderRadius: '10px',
                overflow: 'hidden',
                position: 'relative',
                outline: modelId === m.modelId ? `2.5px solid ${C.ink}` : `1px solid ${C.line}`,
                outlineOffset: modelId === m.modelId ? 1 : 0
              }}
            >
              <Box
                component="img"
                src={m.imageUrl}
                alt=""
                sx={{ width: '100%', aspectRatio: '3 / 4', objectFit: 'cover', display: 'block' }}
              />
              {m.modelId === choice.suggestedModelId && (
                <Typography
                  sx={{
                    position: 'absolute',
                    top: 4,
                    left: 4,
                    bgcolor: C.ink,
                    color: '#fff',
                    fontSize: 10.5,
                    fontWeight: 700,
                    px: 0.75,
                    borderRadius: '6px'
                  }}
                >
                  Gợi ý
                </Typography>
              )}
              <Typography sx={{ fontSize: 11.5, textAlign: 'center', py: 0.5 }}>
                {BODY_LABELS[m.bodyType]} · {m.heightCm} cm
              </Typography>
            </Box>
          ))}
        </Box>
      )}
      {choice.suggestedModelId && (
        <Typography sx={{ fontSize: 12, color: C.muted, mt: 1 }}>
          “Gợi ý”: người mẫu có dáng và chiều cao gần với số đo bạn đã lưu.
        </Typography>
      )}
    </Box>
  );
}

/** AI tạo người mẫu theo mô tả dáng từ số đo đã lưu. */
function GeneratePanel({ choice }) {
  return (
    <Box sx={{ borderRadius: '14px', bgcolor: C.photo, p: 2, minHeight: 200 }}>
      <Typography sx={{ fontWeight: 700, mb: 1 }}>AI sẽ tạo một người mẫu mới</Typography>
      {choice?.generateDescription ? (
        <>
          <Typography sx={{ fontSize: 13.5, color: C.muted, mb: 1 }}>Theo số đo bạn đã lưu, người mẫu sẽ có dáng:</Typography>
          <Typography sx={{ fontSize: 13, fontStyle: 'italic' }}>{choice.generateDescription}</Typography>
          <Typography sx={{ fontSize: 12, color: C.muted, mt: 1.5 }}>Mỗi lần tạo ra một người mẫu khác nhau; mặc 1 món mỗi lần.</Typography>
        </>
      ) : (
        <Typography sx={{ fontSize: 13.5 }}>
          Hãy{' '}
          <Box component={RouterLink} to="/body-profile" sx={{ color: C.accent, fontWeight: 700 }}>
            lưu số đo
          </Box>{' '}
          để AI tạo người mẫu có dáng giống bạn.
        </Typography>
      )}
    </Box>
  );
}

function SetupStep({
  mode,
  allItems,
  selectedIds,
  toggleItem,
  quota,
  photo,
  lastJob,
  useLast,
  setUseLast,
  consent,
  setConsent,
  notReady,
  noTurns,
  busy,
  choice,
  modelId,
  setModelId,
  changeGender,
  onPickFile,
  onCamera,
  canStart,
  onStart
}) {
  const preview = useLast ? null : photo?.url;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '320px 1fr' }, gap: 3 }}>
      {mode === 'MODEL' && <ModelPicker {...{ choice, modelId, setModelId, changeGender }} />}
      {mode === 'GENERATE' && <GeneratePanel choice={choice} />}
      {/* Ảnh của khách */}
      {mode === 'PHOTO' && (
        <Box>
          <Box
            sx={{
              aspectRatio: '3 / 4',
              borderRadius: '14px',
              bgcolor: C.photo,
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
              border: `1px dashed ${C.line}`
            }}
          >
            {preview ? (
              <Box component="img" src={preview} alt="Ảnh của bạn" sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : useLast && lastJob ? (
              <Typography sx={{ fontSize: 13.5, color: C.muted, p: 2, textAlign: 'center' }}>Dùng ảnh bạn đã gửi lần trước</Typography>
            ) : (
              <Typography sx={{ fontSize: 13.5, color: C.muted, p: 2, textAlign: 'center' }}>Chưa có ảnh</Typography>
            )}
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mt: 1.5, flexWrap: 'wrap' }}>
            <Button onClick={onPickFile} sx={buttonSx(false)} size="small">
              Tải ảnh lên
            </Button>
            <Button onClick={onCamera} sx={buttonSx(false)} size="small">
              Chụp bằng camera
            </Button>
            {lastJob && !useLast && (
              <Button onClick={() => setUseLast(true)} sx={{ ...buttonSx(false), borderStyle: 'dashed' }} size="small">
                Dùng ảnh lần trước
              </Button>
            )}
          </Box>
        </Box>
      )}

      <Box>
        <Typography sx={{ fontWeight: 700, mb: 0.25 }}>Món sẽ mặc thử</Typography>
        {allItems.length > 1 && (
          <Typography sx={{ fontSize: 12.5, color: C.muted, mb: 1 }}>Bấm vào món để chọn / bỏ chọn. Mỗi món tốn 1 lượt AI.</Typography>
        )}
        <Box sx={{ display: 'flex', gap: 1.5, mb: 2, flexWrap: 'wrap' }}>
          {allItems.map((i) => {
            const supported = canTry(i);
            const checked = selectedIds.includes(i.productId);
            return (
              <Box
                key={i.productId}
                component="button"
                type="button"
                disabled={!supported || allItems.length === 1}
                onClick={() => toggleItem(i.productId)}
                title={supported ? undefined : 'AI chưa mặc thử được giày dép / phụ kiện'}
                sx={{
                  width: 84,
                  p: 0,
                  border: 0,
                  bgcolor: 'transparent',
                  textAlign: 'left',
                  font: 'inherit',
                  cursor: 'pointer',
                  '&:disabled': { cursor: 'default' }
                }}
              >
                <Box
                  sx={{
                    aspectRatio: '3 / 4',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    bgcolor: C.photo,
                    position: 'relative',
                    outline: checked ? `2.5px solid ${C.ink}` : `1px solid ${C.line}`,
                    opacity: checked ? 1 : 0.45
                  }}
                >
                  {i.imageUrl && (
                    <Box component="img" src={i.imageUrl} alt={i.productName} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                  {allItems.length > 1 && supported && (
                    <Box
                      aria-hidden
                      sx={{
                        position: 'absolute',
                        top: 5,
                        right: 5,
                        width: 20,
                        height: 20,
                        borderRadius: '6px',
                        border: `1.5px solid ${C.ink}`,
                        bgcolor: checked ? C.ink : '#fff',
                        color: '#fff',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 13,
                        fontWeight: 800
                      }}
                    >
                      {checked ? '✓' : ''}
                    </Box>
                  )}
                </Box>
                <Typography sx={{ fontSize: 11.5, mt: 0.5, lineHeight: 1.3 }}>{i.productName}</Typography>
                {!supported && <Typography sx={{ fontSize: 10.5, color: C.muted }}>Chưa hỗ trợ</Typography>}
              </Box>
            );
          })}
        </Box>

        {mode === 'PHOTO' ? (
          <>
            <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Mẹo để ảnh đẹp</Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, color: C.muted, fontSize: 13.5, mb: 2 }}>
              <li>Ảnh một người, đứng thẳng, thấy từ đầu tới gối (thử quần / đầm: thấy cả chân).</li>
              <li>Đủ sáng, nền gọn; mặc đồ ôm vừa người để AI thay đồ chính xác hơn.</li>
            </Box>
            <FormControlLabel
              control={
                <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} sx={{ '&.Mui-checked': { color: C.ink } }} />
              }
              label={
                <Typography sx={{ fontSize: 13.5 }}>
                  Tôi đồng ý gửi ảnh này tới dịch vụ AI để tạo ảnh mặc thử. Ảnh tự xóa sau {quota?.keepHours ?? 24} giờ và tôi có thể xóa
                  ngay bất cứ lúc nào.
                </Typography>
              }
              sx={{ alignItems: 'flex-start', mb: 1.5, '& .MuiCheckbox-root': { pt: 0.25 } }}
            />
          </>
        ) : (
          <Typography sx={{ fontSize: 13, color: C.muted, mb: 2 }}>
            Không cần ảnh của bạn.{' '}
            {mode === 'MODEL' ? 'Bộ đồ này đã có người thử trên người mẫu này thì hiện ngay và không tính lượt.' : ''}
          </Typography>
        )}

        {notReady ? (
          <Typography sx={{ color: C.accent, fontSize: 13.5 }}>
            {quota.message || 'Chức năng mặc thử đang bảo trì, vui lòng thử lại sau.'}
          </Typography>
        ) : (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
            <Button onClick={onStart} disabled={!canStart} sx={buttonSx(true)}>
              {busy ? 'Đang gửi…' : 'Mặc thử'}
            </Button>
            {quota?.ready && (
              <Typography sx={{ fontSize: 13, color: noTurns ? C.accent : C.muted }}>
                {noTurns ? `Bạn đã dùng hết ${quota.limit} lượt trong 24 giờ.` : `Còn ${quota.remaining}/${quota.limit} lượt trong 24 giờ`}
              </Typography>
            )}
          </Box>
        )}
      </Box>
    </Box>
  );
}

function CameraStep({ onCancel, onCaptured }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    let stream;
    let alive = true;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 1600 }, facingMode: 'user' }, audio: false })
      .then((s) => {
        if (!alive) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      })
      .catch(() => setError('Không mở được camera. Hãy cho phép trình duyệt dùng camera, hoặc tải ảnh lên.'));
    if (!navigator.mediaDevices) setError('Trình duyệt không hỗ trợ camera, hãy tải ảnh lên.');
    return () => {
      alive = false;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Đếm ngược 3 giây để khách kịp lùi ra xa, đứng vào khung
  useEffect(() => {
    if (countdown <= 0) return undefined;
    const t = setTimeout(async () => {
      if (countdown === 1) {
        const video = videoRef.current;
        if (video?.videoWidth) onCaptured(await captureVideo(video));
      }
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown, onCaptured]);

  return (
    <Box>
      <Box
        sx={{
          position: 'relative',
          borderRadius: '14px',
          overflow: 'hidden',
          bgcolor: '#000',
          maxHeight: 480,
          display: 'grid',
          placeItems: 'center'
        }}
      >
        {/* Xem trước kiểu gương (ảnh chụp không bị lật) */}
        <Box component="video" ref={videoRef} autoPlay playsInline muted sx={{ width: '100%', maxHeight: 480, transform: 'scaleX(-1)' }} />
        {countdown > 0 && (
          <Typography sx={{ position: 'absolute', color: '#fff', fontSize: 96, fontWeight: 800, textShadow: '0 2px 12px rgba(0,0,0,.6)' }}>
            {countdown}
          </Typography>
        )}
      </Box>
      {error && <Typography sx={{ color: C.accent, fontSize: 13.5, mt: 1 }}>{error}</Typography>}
      <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
        <Button onClick={() => setCountdown(3)} disabled={Boolean(error) || countdown > 0} sx={buttonSx(true)}>
          Chụp (sau 3 giây)
        </Button>
        <Button onClick={onCancel} sx={buttonSx(false)}>
          Quay lại
        </Button>
      </Box>
    </Box>
  );
}

function ResultStep({ job, busy, extraActions, onAgain, onDelete }) {
  const failed = job.status !== 'DONE';
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '360px 1fr' }, gap: 3 }}>
      <Box sx={{ borderRadius: '14px', overflow: 'hidden', bgcolor: C.photo, aspectRatio: '3 / 4', display: 'grid', placeItems: 'center' }}>
        {failed ? (
          <Typography sx={{ color: C.accent, p: 2, textAlign: 'center' }}>
            {job.errorMessage || 'Không mặc thử được, vui lòng thử lại.'}
          </Typography>
        ) : (
          <Box component="img" src={job.resultImageUrl} alt="Ảnh mặc thử" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        )}
      </Box>
      <Box>
        <Typography sx={{ fontWeight: 700, mb: 1 }}>{failed ? 'Chưa mặc thử được' : 'Kết quả mặc thử'}</Typography>
        {job.reused && (
          <Typography sx={{ fontSize: 13, color: C.muted, mb: 1 }}>
            {job.mode === 'MODEL'
              ? 'Món này đã được thử trên người mẫu này, đây là kết quả có sẵn (không tính lượt).'
              : 'Bạn đã thử đúng ảnh và món này trước đó, đây là kết quả cũ (không tính lượt).'}
          </Typography>
        )}
        {job.items.map((i) => (
          <Typography key={i.productId} sx={{ fontSize: 14 }}>
            •{' '}
            <Box component={RouterLink} to={`/shop/products/${i.productId}`} sx={{ color: C.ink }}>
              {i.productName}
            </Box>
          </Typography>
        ))}
        {job.skipped?.length > 0 && (
          <Typography sx={{ fontSize: 13, color: C.muted, mt: 1 }}>
            Chưa mặc thử được: {job.skipped.join(', ')} (AI chưa hỗ trợ giày dép / phụ kiện).
          </Typography>
        )}
        <Typography sx={{ fontSize: 12.5, color: C.muted, mt: 1.5 }}>
          Ảnh do AI tạo để tham khảo kiểu dáng và màu sắc; độ vừa size hãy xem phần Gợi ý size.
        </Typography>
        <Typography sx={{ fontSize: 13, mt: 1 }}>
          <Box component={RouterLink} to="/try-on-history" sx={{ color: C.ink, fontWeight: 700 }}>
            Xem tất cả ảnh đã mặc thử
          </Box>
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2.5 }}>
          {!failed && extraActions}
          <Button onClick={onAgain} sx={buttonSx(false)}>
            {failed ? 'Thử lại' : 'Thử cách khác'}
          </Button>
          {/* Chỉ chế độ có ảnh / kết quả riêng của khách */}
          {job.mode !== 'MODEL' && (
            <Button onClick={onDelete} disabled={busy} sx={{ ...buttonSx(false), borderColor: C.line, color: C.muted }}>
              Xóa ảnh của tôi
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
}

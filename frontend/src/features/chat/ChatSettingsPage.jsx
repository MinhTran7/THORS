import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, CircularProgress, MenuItem, Typography } from '@mui/material';
import { useSWRConfig } from 'swr';
import { useCrumbs } from 'layouts/crumbs';
import { brand, cardSx, fs } from 'features/account/tokens';
import { BrandButton } from 'features/account/components/Brand';
import { FormField, TextInput } from 'features/account/components/Form';
import { PageHeader } from 'features/account/components/Blocks';
import { useToast } from 'features/account/components/Toast';
import { chatApi } from './api';

// Độ dài tối đa — khớp ChatAutoReply.LIMITS ở backend
const LIMITS = {
  chatBotMode: 10,
  chatBotDailyLimit: 5,
  chatBotWaitMinutes: 3,
  chatGreeting: 500,
  chatOpenTime: 5,
  chatCloseTime: 5,
  chatAwayMessage: 500,
  chatQuickReplies: 2000,
  chatFaq: 3000
};

const BOT_MODES = [
  { value: 'OFF', label: 'Tắt' },
  { value: 'AWAY', label: 'Chỉ ngoài giờ làm việc' },
  { value: 'ALWAYS', label: 'Luôn bật' }
];

const SECTIONS = [
  {
    title: 'Trợ lý AI (Gemini)',
    desc:
      'Tự trả lời khách bằng AI: tìm sản phẩm, báo giá và còn hàng theo màu/size, tình trạng đơn của khách, chính sách cửa hàng. ' +
      'Trợ lý chỉ đọc dữ liệu (không sửa đơn, không hoàn tiền, không giảm giá), tự chuyển cho nhân viên khi khách khiếu nại hoặc muốn gặp người thật, ' +
      'và tự im lặng khi nhân viên vừa trả lời cuộc chat đó trong 30 phút — nhưng nếu khách nhắn mà quá số phút chờ bên dưới chưa ai trả lời thì trợ lý trả lời thay. ' +
      'Khi trợ lý trả lời thì không gửi tin chào / tin ngoài giờ.',
    bot: true,
    fields: [
      { key: 'chatBotMode', label: 'Chế độ', half: true, options: BOT_MODES, noCount: true },
      {
        key: 'chatBotDailyLimit',
        label: 'Giới hạn tin trợ lý mỗi ngày',
        half: true,
        type: 'number',
        noCount: true,
        helper: 'Cả cửa hàng; hết lượt thì quay về tin tự động thường. Mỗi cuộc chat tối đa 30 tin/ngày.'
      },
      {
        key: 'chatBotWaitMinutes',
        label: 'Trả lời thay khi chưa ai trả lời sau (phút)',
        half: true,
        type: 'number',
        noCount: true,
        helper: 'Kể cả trong giờ làm việc: khách nhắn quá số phút này mà nhân viên chưa trả lời thì trợ lý trả lời thay. 0 = không.'
      }
    ]
  },
  {
    title: 'Tin chào tự động',
    desc: 'Gửi khi khách nhắn lần đầu, hoặc nhắn lại sau 12 giờ không nhắn. Để trống thì tắt.',
    fields: [{ key: 'chatGreeting', label: 'Nội dung tin chào', multiline: true, rows: 2 }]
  },
  {
    title: 'Ngoài giờ làm việc',
    desc: 'Khách nhắn ngoài giờ sẽ nhận tin này (tối đa 1 lần mỗi 3 giờ). Để trống nội dung thì tắt.',
    fields: [
      { key: 'chatOpenTime', label: 'Giờ mở cửa', half: true, type: 'time', noCount: true },
      { key: 'chatCloseTime', label: 'Giờ đóng cửa', half: true, type: 'time', noCount: true, helper: 'Đóng sớm hơn mở = làm qua đêm.' },
      {
        key: 'chatAwayMessage',
        label: 'Tin trả lời ngoài giờ',
        multiline: true,
        rows: 2,
        helper: 'Viết {open} / {close} để tự chèn giờ mở / đóng cửa.'
      }
    ]
  },
  {
    title: 'Mẫu câu trả lời nhanh',
    desc: 'Mỗi dòng một câu. Khi trả lời khách, bấm biểu tượng tia sét cạnh ô nhập để chọn và điền nhanh.',
    fields: [{ key: 'chatQuickReplies', label: 'Mẫu câu', multiline: true, rows: 6 }]
  },
  {
    title: 'Câu hỏi thường gặp',
    desc: 'Hiện thành nút trong khung chat của khách; khách bấm là nhận trả lời ngay. Câu "Đơn hàng của tôi tới đâu rồi?" luôn có sẵn và tự trả lời theo đơn của khách.',
    fields: [
      {
        key: 'chatFaq',
        label: 'Câu hỏi | Câu trả lời',
        multiline: true,
        rows: 6,
        helper: 'Mỗi dòng: Câu hỏi | Câu trả lời. Dòng thiếu dấu | sẽ bị bỏ qua.'
      }
    ]
  }
];

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Tin nhắn > Cài đặt: chủ cửa hàng sửa tin chào, giờ làm việc, tin ngoài giờ, mẫu câu trả lời nhanh, câu hỏi thường gặp. */
export default function ChatSettingsPage() {
  useCrumbs(['Tin nhắn', 'Cài đặt tự động']);
  const [toast, showToast] = useToast();
  const { mutate } = useSWRConfig();
  const [saved, setSaved] = useState(null);
  const [values, setValues] = useState({});
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    chatApi
      .settings()
      .then((d) => {
        setSaved(d);
        setValues(d);
      })
      .catch((e) => setLoadError(e.message || 'Không tải được cài đặt.'));
  }, []);

  // Trạng thái gần nhất của trợ lý AI (đã trả lời / bỏ qua vì sao / lỗi gì), cập nhật mỗi 10 giây
  const [botEvent, setBotEvent] = useState('');
  useEffect(() => {
    const load = () =>
      chatApi
        .settings()
        .then((d) => setBotEvent(d.botLastEvent || ''))
        .catch(() => {});
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
  }, []);

  const errors = useMemo(() => {
    const result = {};
    Object.entries(LIMITS).forEach(([key, max]) => {
      if ((values[key] || '').trim().length > max) result[key] = `Tối đa ${max} ký tự.`;
    });
    ['chatOpenTime', 'chatCloseTime'].forEach((key) => {
      if (values[key] && !TIME_RE.test(values[key])) result[key] = 'Giờ dạng HH:mm.';
    });
    if (!/^\d{1,4}$/.test(String(values.chatBotDailyLimit ?? ''))) result.chatBotDailyLimit = 'Nhập số từ 0 đến 9999.';
    const wait = String(values.chatBotWaitMinutes ?? '');
    if (!/^\d{1,3}$/.test(wait) || Number(wait) > 120) result.chatBotWaitMinutes = 'Nhập số từ 0 đến 120.';
    return result;
  }, [values]);

  const changed = saved && Object.keys(LIMITS).some((key) => (values[key] || '').trim() !== (saved[key] || '').trim());
  const valid = Object.keys(errors).length === 0;

  const save = async (e) => {
    e.preventDefault();
    if (!valid || !changed) return;
    setSaving(true);
    try {
      // Chỉ gửi những ô đã đổi
      const body = Object.fromEntries(
        Object.keys(LIMITS)
          .filter((key) => (values[key] || '').trim() !== (saved[key] || '').trim())
          .map((key) => [key, (values[key] || '').trim()])
      );
      const next = await chatApi.saveSettings(body);
      setSaved(next);
      setValues(next);
      mutate(['chat-quick-replies']); // trang Tin nhắn dùng mẫu câu mới ngay
      showToast('Đã lưu cài đặt tin nhắn tự động.');
    } catch (err) {
      showToast(err.message || 'Không lưu được, vui lòng thử lại.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <PageHeader
        title="Tin nhắn tự động"
        subtitle="Tự trả lời khách trong khung chat “Liên hệ người bán”. Lưu xong áp dụng ngay cho tin nhắn tiếp theo."
      />

      {loadError && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {!saved && !loadError ? (
        <Box sx={{ display: 'grid', placeItems: 'center', py: 8 }}>
          <CircularProgress size={28} />
        </Box>
      ) : (
        saved && (
          <Box component="form" onSubmit={save} noValidate sx={{ ...cardSx, p: { xs: 2.5, md: 3.5 }, display: 'flex', flexDirection: 'column', gap: 3.5 }}>
            {SECTIONS.map((section) => (
              <Box key={section.title}>
                <Typography variant="h5" sx={{ color: brand.ink, fontSize: fs.cardTitle }}>
                  {section.title}
                </Typography>
                <Typography sx={{ color: brand.muted, fontSize: fs.caption, mt: 0.25, mb: 2 }}>{section.desc}</Typography>
                {section.bot && saved.botConfigured === 'false' && (
                  <Alert severity="warning" sx={{ mb: 2, borderRadius: '10px' }}>
                    Máy chủ chưa có Gemini API key nên trợ lý AI chưa chạy được (khách vẫn nhận tin tự động thường). Lấy key miễn phí ở Google AI
                    Studio rồi thêm dòng <b>thors.ai.gemini-api-key=…</b> vào backend/local.properties và khởi động lại backend.
                  </Alert>
                )}
                {section.bot && saved.botConfigured !== 'false' && (
                  <Alert severity={/lỗi/i.test(botEvent) ? 'error' : 'info'} sx={{ mb: 2, borderRadius: '10px' }}>
                    <b>Trạng thái gần nhất:</b> {botEvent || 'Trợ lý chưa xử lý tin nào từ lúc khởi động backend.'}
                  </Alert>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2.5 }}>
                  {section.fields.map((f) => {
                    const length = (values[f.key] || '').length;
                    return (
                      <Box key={f.key} sx={{ gridColumn: f.half ? 'auto' : '1 / -1' }}>
                        <FormField
                          label={f.label}
                          error={errors[f.key]}
                          helper={f.noCount ? f.helper : `${f.helper ? `${f.helper} ` : ''}${length}/${LIMITS[f.key]} ký tự`}
                        >
                          <TextInput
                            label={f.label}
                            name={f.key}
                            type={f.type}
                            select={Boolean(f.options)}
                            multiline={f.multiline}
                            minRows={f.rows}
                            value={values[f.key] || ''}
                            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                            error={Boolean(errors[f.key])}
                          >
                            {f.options?.map((o) => (
                              <MenuItem key={o.value} value={o.value}>
                                {o.label}
                              </MenuItem>
                            ))}
                          </TextInput>
                        </FormField>
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ))}

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, alignItems: 'center' }}>
              {!changed && <Typography sx={{ fontSize: fs.caption, color: brand.muted }}>Chưa có thay đổi.</Typography>}
              <BrandButton type="submit" disabled={saving || !changed || !valid} startIcon={saving ? <CircularProgress size={14} /> : null}>
                {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
              </BrandButton>
            </Box>
          </Box>
        )
      )}
      {toast}
    </Box>
  );
}

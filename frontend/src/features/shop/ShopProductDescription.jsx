import { useState } from 'react';
import { Box } from '@mui/material';
import { HighlightIcon, SPEC_FIELDS, highlightOf, parseDescription, toLines } from 'features/product/productDescription';
import { C, SERIF, focusRing } from './storeTheme';

/**
 * Mô tả sản phẩm trên trang chi tiết (kiểu Coolmate): các mục thu gọn được
 * — Mô tả, Chất liệu & kiểu dáng (biểu tượng nổi bật + bảng thông số), Bảo quản, Đổi trả.
 * Mục nào không có nội dung thì ẩn. Mô tả cũ dạng chữ thường hiện trong mục "Mô tả".
 */

function Section({ title, children }) {
  const [open, setOpen] = useState(true);
  return (
    <Box sx={{ borderBottom: `1px solid ${C.line}` }}>
      <Box
        component="button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        sx={{
          width: '100%',
          py: 2.5,
          px: 0,
          border: 0,
          bgcolor: 'transparent',
          font: 'inherit',
          fontSize: 18,
          fontWeight: 600,
          color: C.ink,
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          textAlign: 'left',
          ...focusRing
        }}
      >
        {title}
        <Box component="span" aria-hidden="true" sx={{ fontSize: 22, fontWeight: 400, lineHeight: 1, width: 20, textAlign: 'center' }}>
          {open ? '−' : '+'}
        </Box>
      </Box>
      {open && <Box sx={{ pb: 3 }}>{children}</Box>}
    </Box>
  );
}

function Bullets({ lines }) {
  return (
    <Box component="ul" sx={{ m: 0, pl: 3, display: 'flex', flexDirection: 'column', gap: 0.75, fontSize: 16, lineHeight: 1.6, color: '#3F3A34' }}>
      {lines.map((line, i) => (
        <li key={i}>{line}</li>
      ))}
    </Box>
  );
}

export default function ShopProductDescription({ description }) {
  const d = parseDescription(description);
  const intro = d.intro.trim();
  const highlights = d.highlights.map(highlightOf).filter(Boolean);
  const specs = SPEC_FIELDS.filter((f) => d[f.key].trim());
  const care = toLines(d.care);
  const returns = toLines(d.returns);
  if (!intro && !highlights.length && !specs.length && !care.length && !returns.length) return null;

  return (
    <Box component="section" sx={{ mt: { xs: 4, md: 6 } }}>
      <Box component="h2" sx={{ m: 0, mb: 1, fontFamily: SERIF, fontWeight: 400, fontSize: { xs: 26, md: 32 }, color: C.ink }}>
        Mô tả sản phẩm
      </Box>
      <Box sx={{ borderTop: `1px solid ${C.line}`, maxWidth: 820 }}>
        {intro && (
          <Section title="Mô tả">
            <Box sx={{ fontSize: 16, lineHeight: 1.8, color: '#3F3A34', whiteSpace: 'pre-line' }}>{intro}</Box>
          </Section>
        )}

        {(highlights.length > 0 || specs.length > 0) && (
          <Section title="Chất liệu & kiểu dáng">
            {highlights.length > 0 && (
              <Box
                component="ul"
                sx={{ listStyle: 'none', m: 0, p: 0, mb: specs.length ? 3 : 0, display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: { xs: 2, sm: 4 } }}
              >
                {highlights.map((h) => (
                  <Box component="li" key={h.key} sx={{ width: 96, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
                    <Box
                      sx={{
                        width: 56,
                        height: 56,
                        borderRadius: '14px',
                        border: `2px solid ${C.ink}`,
                        display: 'grid',
                        placeItems: 'center',
                        color: C.ink
                      }}
                    >
                      <HighlightIcon highlight={h} size={30} />
                    </Box>
                    <Box component="span" sx={{ fontSize: 15, fontWeight: 600, color: C.ink }}>
                      {h.label}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
            {specs.length > 0 && (
              <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: { xs: '110px 1fr', sm: '160px 1fr' }, rowGap: 1.5, columnGap: 2, fontSize: 16, lineHeight: 1.6 }}>
                {specs.map((f) => (
                  <Box key={f.key} sx={{ display: 'contents' }}>
                    <Box component="dt" sx={{ color: C.muted }}>
                      {f.label}
                    </Box>
                    <Box component="dd" sx={{ m: 0, color: C.ink, whiteSpace: 'pre-line' }}>
                      {d[f.key].trim()}
                    </Box>
                  </Box>
                ))}
              </Box>
            )}
          </Section>
        )}

        {care.length > 0 && (
          <Section title="Bảo quản">
            <Bullets lines={care} />
          </Section>
        )}

        {returns.length > 0 && (
          <Section title="Đổi trả">
            <Bullets lines={returns} />
          </Section>
        )}
      </Box>
    </Box>
  );
}

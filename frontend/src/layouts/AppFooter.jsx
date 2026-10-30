import { Typography } from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { PROFILE_TAGLINE, STORE_NAME } from 'features/account/constants';
import { brand } from 'features/account/tokens';

// Footer cố định ở cuối màn hình, chỉ có thông tin bản quyền và slogan.
export default function AppFooter() {
  return (
    <Stack
      component="footer"
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ xs: 'flex-start', sm: 'center' }}
      spacing={0.5}
      sx={{
        px: { xs: 2, md: 4 },
        py: 1.5,
        borderTop: `1px solid ${brand.line}`,
        bgcolor: brand.surface,
        position: 'sticky',
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar
      }}
    >
      <Typography variant="caption" sx={{ color: brand.muted }}>
        © {new Date().getFullYear()} {STORE_NAME}. Bảo lưu mọi quyền.
      </Typography>
      <Typography variant="caption" sx={{ color: brand.muted, letterSpacing: 0.8 }}>
        {PROFILE_TAGLINE}
      </Typography>
    </Stack>
  );
}
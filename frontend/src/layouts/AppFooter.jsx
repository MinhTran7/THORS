import { Typography } from '@mui/material';
import { Stack } from 'features/account/components/Flex';
import { PROFILE_TAGLINE } from 'features/account/constants';
import { brand } from 'features/account/tokens';

export default function AppFooter() {
  return (
    <Stack
      component="footer"
      direction="row"
      justifyContent="flex-end"
      alignItems="center"
      sx={{
        px: { xs: 2, md: 4 },
        py: 1.5,
        borderTop: `1px solid ${brand.line}`,
        bgcolor: brand.surface,
        position: 'sticky',
        bottom: 0,
        zIndex: (theme) => theme.zIndex.appBar,
        flexShrink: 0,
        boxSizing: 'border-box'
      }}
    >
      <Typography variant="caption" sx={{ color: brand.muted, letterSpacing: 0.8 }}>
        {PROFILE_TAGLINE}
      </Typography>
    </Stack>
  );
}

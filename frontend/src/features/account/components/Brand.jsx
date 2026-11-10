import { Button, Switch, styled } from '@mui/material';
import { brand } from '../tokens';

export function BrandButton({ sx, ...props }) {
  return (
    <Button
      variant="contained"
      disableElevation
      {...props}
      sx={{
        bgcolor: brand.cyan,
        color: brand.inkOnCyan,
        fontWeight: 800,
        borderRadius: '12px',
        textTransform: 'none',
        '&:hover': { bgcolor: brand.cyanHover, boxShadow: 'none' },
        '&.Mui-disabled': { bgcolor: brand.neutralBg, color: brand.muted },
        ...sx
      }}
    />
  );
}

export function OutlineButton({ sx, ...props }) {
  return (
    <Button
      variant="outlined"
      color="inherit"
      {...props}
      sx={{
        bgcolor: brand.surface,
        border: `1.5px solid ${brand.line}`,
        color: '#374151',
        fontWeight: 700,
        borderRadius: '12px',
        textTransform: 'none',
        '&:hover': { bgcolor: '#FAFDFD', border: `1.5px solid ${brand.cyan}` },
        ...sx
      }}
    />
  );
}

export const BrandSwitch = styled(Switch)({
  '& .MuiSwitch-track': { backgroundColor: '#D5D7D0', opacity: 1 },
  '& .MuiSwitch-switchBase.Mui-checked': { color: '#fff' },
  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: brand.cyan, opacity: 1 },
  '& .MuiSwitch-switchBase.Mui-disabled + .MuiSwitch-track': { opacity: 0.5 }
});
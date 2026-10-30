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
        fontWeight: 600,
        borderRadius: '10px',
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
        borderColor: brand.line,
        color: brand.ink,
        fontWeight: 600,
        borderRadius: '10px',
        textTransform: 'none',
        '&:hover': { bgcolor: '#F6F6F1', borderColor: '#D8D9D2' },
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
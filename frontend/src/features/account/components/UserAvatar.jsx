import { Avatar } from '@mui/material';
import { brand } from '../tokens';
import { initials } from '../format';

export default function UserAvatar({ name, src, size = 32, sx }) {
  return (
    <Avatar
      src={src || undefined}
      alt={name}
      sx={{ width: size, height: size, bgcolor: brand.cyanSoft, color: brand.ink, fontSize: size * 0.38, fontWeight: 600, ...sx }}
    >
      {initials(name)}
    </Avatar>
  );
}
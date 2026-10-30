import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Box, Divider, IconButton, ListItemIcon, ListItemText, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import { LockOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { ROLE_TITLE } from 'features/account/constants';
import { brand } from 'features/account/tokens';
import UserAvatar from 'features/account/components/UserAvatar';

const itemSx = { py: 1.1, px: 2, '& .MuiListItemIcon-root': { minWidth: 32, color: brand.ink } };

// Avatar ở góc phải header: bấm vào mở menu tài khoản (Profile, Change password, Sign out).
export default function UserMenu({ onSignOut }) {
  const { account } = useAuth();
  const [anchor, setAnchor] = useState(null);
  const close = () => setAnchor(null);

  return (
    <>
      <Tooltip title="Tài khoản">
        <IconButton
          size="small"
          aria-label="Menu tài khoản"
          aria-haspopup="true"
          aria-expanded={anchor ? 'true' : undefined}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ p: 0.25 }}
        >
          <UserAvatar name={account.fullName} src={account.avatarUrl} size={30} />
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{
          paper: {
            sx: {
              width: 248,
              mt: 1,
              borderRadius: '14px',
              border: `1px solid ${brand.line}`,
              boxShadow: '0 8px 24px rgba(31, 41, 55, 0.12)'
            }
          }
        }}
      >
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2" noWrap sx={{ color: brand.ink, fontWeight: 700 }}>
            {account.fullName}
          </Typography>
          <Typography variant="caption" noWrap sx={{ color: brand.muted, display: 'block' }}>
            {ROLE_TITLE[account.role]}
          </Typography>
        </Box>
        <Divider />
        <MenuItem component={Link} to="/profile" onClick={close} sx={itemSx}>
          <ListItemIcon>
            <UserOutlined />
          </ListItemIcon>
          <ListItemText primary="Hồ sơ cá nhân" slotProps={{ primary: { sx: { fontSize: 14 } } }} />
        </MenuItem>
        <MenuItem component={Link} to="/profile/password" onClick={close} sx={itemSx}>
          <ListItemIcon>
            <LockOutlined />
          </ListItemIcon>
          <ListItemText primary="Đổi mật khẩu" slotProps={{ primary: { sx: { fontSize: 14 } } }} />
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            close();
            onSignOut();
          }}
          sx={itemSx}
        >
          <ListItemIcon>
            <LogoutOutlined />
          </ListItemIcon>
          <ListItemText primary="Đăng xuất" slotProps={{ primary: { sx: { fontSize: 14 } } }} />
        </MenuItem>
      </Menu>
    </>
  );
}
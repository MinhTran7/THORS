import { useNavigate } from 'react-router-dom';
import { Badge, IconButton, Tooltip } from '@mui/material';
import { MessageOutlined } from '@ant-design/icons';
import { useAuth } from 'features/auth/AuthProvider';
import { openCustomerChat, useChatStatus } from './api';

// Ai được vào trang Tin nhắn của cửa hàng (/messages), khớp routes/index.jsx
const STORE_ROLES = ['OWNER', 'FAMILY_MEMBER'];

/**
 * Nút Tin nhắn trên header, cạnh chuông thông báo, kèm số tin chưa đọc.
 *  - Chủ shop / người nhà: mở trang Tin nhắn (khách gửi qua "Liên hệ người bán").
 *  - Khách hàng: mở khung chat với cửa hàng.
 * Ẩn khi chat chưa bật (database chưa chạy migration chat) hoặc vai trò không dùng chat (Admin).
 */
export default function ChatHeaderButton() {
  const { account } = useAuth();
  const navigate = useNavigate();
  const isStore = STORE_ROLES.includes(account?.role);
  const isCustomer = account?.role === 'CUSTOMER';
  const { available, unread } = useChatStatus(isStore || isCustomer);
  if (!available) return null;

  const title = unread > 0 ? `${unread} ${isStore ? 'cuộc trò chuyện có tin chưa đọc' : 'tin nhắn mới'}` : 'Tin nhắn';
  return (
    <Tooltip title={title}>
      <IconButton aria-label={title} onClick={() => (isStore ? navigate('/messages') : openCustomerChat())}>
        <Badge color="error" badgeContent={unread} max={99}>
          <MessageOutlined style={{ fontSize: 18 }} />
        </Badge>
      </IconButton>
    </Tooltip>
  );
}

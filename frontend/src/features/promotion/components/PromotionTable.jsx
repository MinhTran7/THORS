import {
  Box,
  IconButton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography
} from '@mui/material';
import { DeleteOutlined, EditOutlined, EyeOutlined, StopOutlined } from '@ant-design/icons';
import { C, SCHEDULE_TONE } from '../theme';
import { capText, discountText, formatDateTime, isRunning, money, SCHEDULE_LABEL } from '../utils';

export function ScheduleBadge({ schedule, sx }) {
  const tone = SCHEDULE_TONE[schedule] || SCHEDULE_TONE.ENDED;
  return (
    <Box
      sx={{
        display: 'inline-block',
        fontWeight: 700,
        borderRadius: 1.5,
        px: 1,
        py: 0.2,
        fontSize: 11,
        bgcolor: tone.bg,
        color: tone.color,
        ...sx
      }}
    >
      {SCHEDULE_LABEL[schedule] || '—'}
    </Box>
  );
}

const switchSx = {
  width: 34,
  height: 18,
  p: 0,
  '& .MuiSwitch-switchBase': {
    p: '2px',
    transitionDuration: '200ms',
    '&.Mui-checked': {
      transform: 'translateX(16px)',
      color: '#67E8F9',
      '& + .MuiSwitch-track': { bgcolor: '#BAF2F8', opacity: 1, border: 0 }
    }
  },
  '& .MuiSwitch-thumb': { boxShadow: '0 1px 2px rgba(0,0,0,0.15)', width: 14, height: 14 },
  '& .MuiSwitch-track': { borderRadius: 9, bgcolor: '#CBD5E1', opacity: 1 }
};

function StatusSwitch({ promotion, onToggle }) {
  const on = isRunning(promotion);
  return (
    <Stack direction="row" spacing={1.25} sx={{ pt: 0.5, alignItems: 'center' }}>
      <Switch checked={on} onChange={() => onToggle(promotion)} size="small" sx={switchSx} />
      <Box
        sx={{
          px: 1.5,
          py: 0.35,
          borderRadius: 1.75,
          fontSize: 13,
          fontWeight: 600,
          bgcolor: on ? '#E7F6F1' : '#F0F2F4',
          color: on ? '#168B70' : '#75869F'
        }}
      >
        {promotion.schedule === 'ENDED' ? 'Đã kết thúc' : on ? 'Đang bật' : 'Đang tắt'}
      </Box>
    </Stack>
  );
}

function UsageBar({ used = 0, limit }) {
  const percent = Math.min(100, (used / limit) * 100);
  return (
    <Box sx={{ maxWidth: 170 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
        <Typography sx={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>
          {used}/{limit} lượt
        </Typography>
        <Typography sx={{ fontSize: 11.5, color: C.muted }}>{Math.round(percent)}%</Typography>
      </Box>
      <Box sx={{ mt: 0.75, height: 6, borderRadius: 3, bgcolor: C.border, overflow: 'hidden' }}>
        <Box sx={{ width: `${percent}%`, height: '100%', bgcolor: percent >= 100 ? C.error : percent >= 80 ? '#F59E0B' : '#67E8F9' }} />
      </Box>
    </Box>
  );
}

function Action({ title, hover = '#0F172A', onClick, children }) {
  return (
    <Tooltip title={title}>
      <IconButton size="small" onClick={onClick} sx={{ color: C.muted, p: 0.75, '&:hover': { color: hover, bgcolor: 'transparent' } }}>
        {children}
      </IconButton>
    </Tooltip>
  );
}

const tableSx = {
  minWidth: 1100,
  tableLayout: 'fixed',
  '& th': {
    color: C.muted,
    fontSize: 12,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    py: 1.75,
    borderBottom: `1px solid ${C.borderLight}`
  },
  '& td': { borderColor: C.borderLight, py: 2, fontSize: 13.5, color: C.text }
};

const small = { fontSize: 11.5, color: C.subtle };

// Bảng danh sách khuyến mãi; mã giảm giá online có thêm cột Áp dụng và Lượt dùng
export default function PromotionTable({ kind, rows, startIndex, actions, onView }) {
  const voucher = kind === 'ORDER';
  return (
    <TableContainer sx={{ overflowX: 'auto' }}>
      <Table sx={tableSx}>
        <TableHead>
          <TableRow>
            <TableCell align="center" sx={{ pl: 3, width: '5%' }}>
              STT
            </TableCell>
            <TableCell sx={{ width: '14%' }}>Tên khuyến mãi</TableCell>
            <TableCell sx={{ width: '10%' }}>Mức giảm</TableCell>
            <TableCell sx={{ width: '14%' }}>Thời gian</TableCell>
            {voucher && <TableCell sx={{ width: '18%' }}>Áp dụng</TableCell>}
            {voucher && <TableCell sx={{ width: '18%' }}>Lượt dùng</TableCell>}
            <TableCell sx={{ width: '12%' }}>Trạng thái</TableCell>
            <TableCell align="center" sx={{ pr: 3, width: '9%' }}>
              Thao tác
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={voucher ? 8 : 6} align="center" sx={{ py: 6 }}>
                <Typography sx={{ color: C.muted, fontSize: 14 }}>Không có chương trình khuyến mãi nào phù hợp.</Typography>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((p, index) => (
              <TableRow key={p.promotionId} hover sx={{ '&:hover': { bgcolor: '#FAFCFE' } }}>
                <TableCell align="center" sx={{ pl: 3, color: `${C.muted} !important`, fontWeight: 600 }}>
                  {startIndex + index + 1}
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontWeight: 800, fontSize: 13.5, overflowWrap: 'anywhere' }}>{p.name}</Typography>
                  {p.description && (
                    <Typography
                      sx={{
                        ...small,
                        fontSize: 12,
                        mt: 0.25,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}
                    >
                      {p.description}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{discountText(p)}</Typography>
                  {capText(p) && <Typography sx={small}>{capText(p)}</Typography>}
                </TableCell>
                <TableCell>
                  <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{formatDateTime(p.startDate)}</Typography>
                  <Typography sx={small}>đến {formatDateTime(p.endDate)}</Typography>
                  <ScheduleBadge schedule={p.schedule} sx={{ mt: 0.35 }} />
                </TableCell>
                {voucher && (
                  <TableCell>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Đơn hàng online</Typography>
                    <Typography sx={small}>Đơn từ {money(p.minOrderValue)}</Typography>
                  </TableCell>
                )}
                {voucher && (
                  <TableCell>
                    <UsageBar used={p.usedCount} limit={p.usageLimit} />
                  </TableCell>
                )}
                <TableCell>
                  <StatusSwitch promotion={p} onToggle={actions.toggle} />
                </TableCell>
                <TableCell align="center" sx={{ pr: 3 }}>
                  <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'center' }}>
                    <Action title="Xem chi tiết" onClick={() => onView(p)}>
                      <EyeOutlined style={{ fontSize: 17 }} />
                    </Action>
                    <Action title="Chỉnh sửa" onClick={() => actions.edit(p)}>
                      <EditOutlined style={{ fontSize: 17 }} />
                    </Action>
                    {p.canEndEarly && (
                      <Action title="Kết thúc sớm" hover={C.discount} onClick={() => actions.endEarly(p)}>
                        <StopOutlined style={{ fontSize: 17 }} />
                      </Action>
                    )}
                    {p.canDelete && (
                      <Action title="Xóa" hover={C.danger} onClick={() => actions.remove(p)}>
                        <DeleteOutlined style={{ fontSize: 17 }} />
                      </Action>
                    )}
                  </Stack>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

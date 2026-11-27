import { Box } from '@mui/material';
import { CreditCardOutlined, DollarOutlined } from '@ant-design/icons';
import { C } from '../theme';
import { isCashMethod } from '../utils';

export default function PaymentBadge({ method }) {
  const cash = isCashMethod(method);
  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.5,
        py: 0.5,
        borderRadius: 4,
        bgcolor: cash ? C.cream : C.cyan,
        color: cash ? C.creamText : C.cyanText,
        fontSize: 12,
        fontWeight: 700
      }}
    >
      {cash ? <DollarOutlined style={{ fontSize: 12 }} /> : <CreditCardOutlined style={{ fontSize: 12 }} />}
      <span>{cash ? 'Tiền mặt' : 'Chuyển khoản'}</span>
    </Box>
  );
}

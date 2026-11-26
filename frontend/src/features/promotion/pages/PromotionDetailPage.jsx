import { useNavigate, useParams } from 'react-router-dom';
import { Box, Button, Card, CircularProgress, Stack, Typography } from '@mui/material';
import { DeleteOutlined, EditOutlined, StopOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { pageTitleSx } from 'themes/pageType';
import { ConditionCard, OverviewCard, ProductScopeCard } from '../components/DetailCards';
import { ActionDialogs } from '../components/PromotionDialogs';
import { OrdersReport, SalesReport } from '../components/ReportCards';
import { usePromotion, usePromotionActions } from '../hooks';
import { C, primaryButtonSx, secondaryButtonSx } from '../theme';
import { KIND } from '../utils';

export default function PromotionDetailPage({ kind = 'PRODUCT' }) {
  const navigate = useNavigate();
  const { promotionId } = useParams();
  const { base, title, name } = KIND[kind];
  useCrumbs([title, `Chi tiết ${name}`]);
  const { promotion, error, reload } = usePromotion(promotionId, kind);
  // Xóa xong về danh sách; kết thúc sớm thì tải lại chi tiết
  const actions = usePromotionActions((done) => (done.deletes ? navigate(base, { replace: true }) : reload()));

  if (error)
    return (
      <Card sx={{ my: 8, p: 4, textAlign: 'center', borderRadius: 3.5, border: `1px solid ${C.border}` }}>
        <Typography color="error" sx={{ fontWeight: 700, fontSize: 15 }}>
          {error}
        </Typography>
      </Card>
    );
  if (!promotion)
    return (
      <Box sx={{ py: 10, textAlign: 'center' }}>
        <CircularProgress size={38} sx={{ color: C.cyan }} />
      </Box>
    );

  return (
    <Box sx={{ color: C.text, pb: 6 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Typography variant="h3" sx={pageTitleSx}>
          Chi tiết {name}
        </Typography>
        <Stack direction="row" spacing={1}>
          {promotion.canEndEarly && (
            <Button
              startIcon={<StopOutlined />}
              onClick={() => actions.endEarly(promotion)}
              sx={{ ...secondaryButtonSx, color: C.discount }}
            >
              Kết thúc sớm
            </Button>
          )}
          {promotion.canDelete && (
            <Button startIcon={<DeleteOutlined />} onClick={() => actions.remove(promotion)} sx={{ ...secondaryButtonSx, color: C.danger }}>
              Xóa
            </Button>
          )}
          <Button variant="contained" startIcon={<EditOutlined />} onClick={() => actions.edit(promotion)} sx={primaryButtonSx}>
            Chỉnh sửa
          </Button>
        </Stack>
      </Box>

      <OverviewCard promotion={promotion} />
      {kind === 'ORDER' ? (
        <>
          <ConditionCard promotion={promotion} />
          <OrdersReport promotionId={promotion.promotionId} />
        </>
      ) : (
        <>
          <SalesReport promotionId={promotion.promotionId} />
          <ProductScopeCard promotion={promotion} />
        </>
      )}

      <ActionDialogs {...actions.dialogs} />
    </Box>
  );
}

import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';
import useSWR, { useSWRConfig } from 'swr';
import { Alert, Box, Skeleton } from '@mui/material';
import { RollbackOutlined } from '@ant-design/icons';
import { useCrumbs } from 'layouts/crumbs';
import { StoreCrumb } from 'features/account/components/StoreAccount';
import CustomerReturnDialog from '../returns/CustomerReturnDialog';
import { ordersApi, refreshAllOrders } from './api';
import { hasReturn, withinReturnWindow } from './constants';
import { C, eyebrowSx, pageTitleSx, panelSx, storeBtnSx } from './storeStyle';

/**
 * Trang "Yêu cầu trả hàng & hoàn tiền" của khách (/orders/:id/return).
 * Trước đây là hộp thoại trên trang chi tiết đơn; nhóm muốn mở thành một trang riêng cho dễ điền.
 * Gửi xong thì về trang chi tiết đơn, kèm thông báo đã gửi.
 */
export default function OrderReturnPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { mutate: globalMutate } = useSWRConfig();
  const { data: order, error, isLoading } = useSWR(['order', id], () => ordersApi.detail(id));
  useCrumbs(['Đơn hàng', order ? `Đơn hàng #${order.orderNumber}` : 'Chi tiết đơn hàng', 'Yêu cầu trả hàng']);

  const detailPath = `/orders/${id}`;
  const back = () => navigate(detailPath);

  let notice = '';
  if (error && !order) notice = error.message || 'Không xem được đơn hàng.';
  else if (order && hasReturn(order.returnStatus)) notice = 'Đơn hàng này đã có yêu cầu trả hàng. Mỗi đơn chỉ được trả một lần.';
  else if (order && !withinReturnWindow(order))
    notice = 'Đơn hàng này không còn trong thời hạn trả hàng (7 ngày kể từ lúc giao thành công) hoặc chưa được giao.';

  return (
    <Box>
      <StoreCrumb
        back={{ to: detailPath, label: order ? `Đơn hàng #${order.orderNumber}` : 'Chi tiết đơn hàng', icon: <RollbackOutlined /> }}
        current="Yêu cầu trả hàng"
      />
      <Box sx={{ mb: { xs: 3, sm: 4 } }}>
        <Box component="p" sx={{ ...eyebrowSx, mb: 1.5 }}>
          Trả hàng & hoàn tiền
        </Box>
        <Box component="h1" sx={pageTitleSx}>
          Yêu cầu trả hàng
        </Box>
        <Box component="p" sx={{ m: 0, mt: 1.5, fontSize: 15, color: C.muted }}>
          Chọn sản phẩm muốn trả, lý do và tài khoản nhận tiền hoàn. Cửa hàng sẽ kiểm tra và phản hồi sớm nhất.
        </Box>
      </Box>

      {isLoading && !order ? (
        <Box sx={{ ...panelSx, p: { xs: 2.5, sm: 4 } }}>
          <Skeleton height={32} width="40%" />
          <Skeleton height={180} />
        </Box>
      ) : notice ? (
        <Box sx={{ ...panelSx, p: { xs: 2.5, sm: 4 } }}>
          <Alert severity="info" sx={{ mb: 2.5 }}>
            {notice}
          </Alert>
          <Box component={RouterLink} to={detailPath} sx={storeBtnSx('dark')}>
            XEM ĐƠN HÀNG
          </Box>
        </Box>
      ) : (
        <Box sx={{ ...panelSx, p: { xs: 2.5, sm: 4 } }}>
          <CustomerReturnDialog
            asPage
            orderData={order}
            isPublic={false}
            onClose={back}
            onSuccess={async (msg) => {
              await refreshAllOrders(globalMutate);
              navigate(detailPath, { replace: true, state: { returnSuccess: msg } });
            }}
          />
        </Box>
      )}
    </Box>
  );
}

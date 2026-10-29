import { Outlet } from 'react-router-dom';
import { Alert, Box, Button, Chip, Collapse, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { api } from 'services/http';
import { WarehouseProvider, useWarehouse } from './WarehouseContext';
import InventoryPage from './InventoryPage';
import DocumentsPage from './DocumentsPage';
import LocationsPage from './LocationsPage';
import SuppliersPage from './SuppliersPage';
import { DocumentAction, DocumentDetail } from './DocumentsPage';
import DocumentForm from './DocumentForm';
import { when } from './model';
function Content() {
  const { owner, notices, noticeError, documents, run } = useWarehouse();
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);
  const [action, setAction] = useState(null);
  const unread = notices.filter((n) => !n.is_read).length;
  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          QUẢN LÝ KHO · KHO CỬA HÀNG
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Chip size="small" variant="outlined" label={owner ? 'Chủ cửa hàng' : 'Thành viên gia đình'} />
          {owner && <Button onClick={() => setOpen(!open)}>Thông báo kho {unread > 0 ? `(${unread})` : ''}</Button>}
        </Stack>
      </Stack>
      <Collapse in={open}>
        <Stack spacing={1}>
          {noticeError && <Alert severity="error">{noticeError.message}</Alert>}
          {!notices.length && <Alert severity="info">Chưa có thông báo kho.</Alert>}
          {notices.map((n) => (
            <Alert
              key={n.user_notification_id}
              severity={n.type === 'WAREHOUSE_SHORTAGE' ? 'warning' : 'info'}
              action={
                <Stack direction="row">
                  <Button
                    size="small"
                    onClick={() => {
                      if (documents.some((d) => d.receipt_id === n.related_entity_id)) setDetail(n.related_entity_id);
                    }}
                  >
                    Xem phiếu
                  </Button>
                  {!n.is_read && (
                    <Button
                      size="small"
                      onClick={() =>
                        run(() => api(`/warehouse/notifications/${n.user_notification_id}/read`, { method: 'POST' })).catch(() => {})
                      }
                    >
                      Đã đọc
                    </Button>
                  )}
                </Stack>
              }
            >
              <b>{n.title}</b>
              <Typography variant="body2">{n.message}</Typography>
              <Typography variant="caption">{when(n.created_at)}</Typography>
            </Alert>
          ))}
        </Stack>
      </Collapse>
      <Box>
        <Outlet />
      </Box>
      {detail && (
        <DocumentDetail
          id={detail}
          onClose={() => setDetail(null)}
          onEdit={(d) => {
            setDetail(null);
            setEdit(d);
          }}
          onAction={(doc, kind) => setAction({ doc, kind })}
        />
      )}
      {edit && <DocumentForm type={edit.receipt_type} document={edit} onClose={() => setEdit(null)} />}
      {action && <DocumentAction action={action} onClose={() => setAction(null)} />}
    </>
  );
}
export default function WarehousePage() {
  return (
    <WarehouseProvider>
      <Content />
    </WarehouseProvider>
  );
}
export const warehouseRoutes = [
  { path: 'inventory', element: <InventoryPage /> },
  { path: 'orders', element: <DocumentsPage key="orders" type="PURCHASE_ORDER" /> },
  { path: 'receipts', element: <DocumentsPage key="receipts" type="RECEIPT" /> },
  { path: 'returns', element: <DocumentsPage key="returns" type="SUPPLIER_RETURN" /> },
  { path: 'layout', element: <LocationsPage key="layout" editLayout /> },
  { path: 'locations', element: <LocationsPage key="locations" /> },
  { path: 'suppliers', element: <SuppliersPage /> }
];

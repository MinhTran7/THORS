import { Outlet } from 'react-router-dom';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { WarehouseProvider, useWarehouse } from './WarehouseContext';
import InventoryPage from './InventoryPage';
import DocumentsPage from './DocumentsPage';
import LocationsPage from './LocationsPage';
import SuppliersPage from './SuppliersPage';
import OrdersPage from './OrdersPage';
import CountsPage from './CountsPage';
import ReportPage from './ReportPage';
// Warehouse notices are shown in the shared notification bell in the header, not on this page.
function Content() {
  const { owner } = useWarehouse();
  return (
    <>
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
        <Typography variant="caption" color="text.secondary">
          QUẢN LÝ KHO · KHO CỬA HÀNG
        </Typography>
        <Chip size="small" variant="outlined" label={owner ? 'Chủ cửa hàng' : 'Thành viên gia đình'} />
      </Stack>
      <Box>
        <Outlet />
      </Box>
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
  { path: 'orders', element: <OrdersPage /> },
  { path: 'receipts', element: <DocumentsPage key="receipts" type="RECEIPT" /> },
  { path: 'returns', element: <DocumentsPage key="returns" type="SUPPLIER_RETURN" /> },
  { path: 'counts', element: <CountsPage /> },
  { path: 'report', element: <ReportPage /> },
  { path: 'layout', element: <LocationsPage key="layout" editLayout /> },
  { path: 'locations', element: <LocationsPage key="locations" /> },
  { path: 'suppliers', element: <SuppliersPage /> }
];

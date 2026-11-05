import { useState } from 'react';
import useSWR from 'swr';
import { api } from 'services/http';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import MainCard from 'components/MainCard';
import { useWarehouse } from './WarehouseContext';
import { DataTable, Status, Title } from './components';
import { docCode, money, number, supplierKey, totalQty, typeLabel, when } from './model';
import { DocumentAction, DocumentDetail } from './DocumentsPage';
import DocumentForm from './DocumentForm';
export default function SuppliersPage() {
  const { documents } = useWarehouse();
  const credits = useSWR('/warehouse/supplier-credits', api);
  const creditOf = (name) => credits.data?.find((c) => supplierKey(c.supplier_name) === supplierKey(name));
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState(null);
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);
  const [action, setAction] = useState(null);
  const names = [...new Set(documents.filter((d) => d.manufacturer_name).map((d) => d.manufacturer_name))];
  const rows = names
    .filter((n) => n.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')))
    .map((name) => {
      const docs = documents.filter((d) => d.manufacturer_name === name);
      const confirmed = docs.filter((d) => ['CONFIRMED', 'CLOSED'].includes(d.status));
      return {
        _key: name,
        name,
        orders: docs.filter((d) => d.receipt_type === 'PURCHASE_ORDER').length,
        received: confirmed.filter((d) => d.receipt_type === 'RECEIPT').reduce((n, d) => n + totalQty(d), 0),
        returned: confirmed.filter((d) => d.receipt_type === 'SUPPLIER_RETURN').reduce((n, d) => n + totalQty(d), 0),
        amount: confirmed
          .filter((d) => d.receipt_type !== 'PURCHASE_ORDER')
          .reduce((n, d) => n + (d.receipt_type === 'RECEIPT' ? 1 : -1) * Number(d.total_amount), 0),
        paid: Number(creditOf(name)?.payment_amount || 0),
        debt: Number(creditOf(name)?.debt_amount || 0),
        undeclared: Number(creditOf(name)?.undeclared_receipts || 0),
        refunded: Number(creditOf(name)?.refund_amount || 0),
        credit: Number(creditOf(name)?.credit_balance || 0)
      };
    });
  return (
    <>
      <Title title="Nhà cung cấp" subtitle="Tổng hợp nhà sản xuất/nhà cung cấp từ phiếu đặt, cùng lịch sử nhập và trả hàng." />
      <MainCard>
        <TextField
          size="small"
          placeholder="Tìm nhà sản xuất / nhà cung cấp"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ mb: 2, minWidth: 280 }}
          slotProps={{ htmlInput: { 'aria-label': 'Tìm nhà cung cấp' } }}
        />
        <DataTable
          rows={rows}
          onRow={(r) => setSupplier(r.name)}
          columns={[
            {
              key: 'name',
              label: 'Nhà sản xuất / nhà cung cấp',
              render: (r) => (
                <Typography variant="subtitle2" color="primary">
                  {r.name}
                </Typography>
              )
            },
            { key: 'orders', label: 'Phiếu đặt', align: 'right', render: (r) => number(r.orders) },
            { key: 'received', label: 'Đã nhập', align: 'right', render: (r) => number(r.received) },
            { key: 'returned', label: 'Đã trả', align: 'right', render: (r) => number(r.returned) },
            { key: 'amount', label: 'Giá trị nhập sau trả', align: 'right', render: (r) => money(r.amount) },
            { key: 'paid', label: 'Đã thanh toán', align: 'right', render: (r) => money(r.paid) },
            {
              key: 'debt',
              label: 'Còn nợ',
              align: 'right',
              render: (r) => (
                <>
                  {money(r.debt)}
                  {r.undeclared > 0 && (
                    <Typography variant="caption" color="warning.main" component="div">
                      + {number(r.undeclared)} phiếu nhập chưa khai báo
                    </Typography>
                  )}
                </>
              )
            },
            { key: 'refunded', label: 'Đã nhận hoàn tiền', align: 'right', render: (r) => money(r.refunded) },
            { key: 'credit', label: 'Tiền đối trừ đang giữ', align: 'right', render: (r) => money(r.credit) }
          ]}
        />
        <Typography variant="caption" color="text.secondary">
          Còn nợ = giá trị phiếu nhập − số đã trả trước khi theo dõi − thanh toán − đối trừ, chỉ tính các phiếu đã xác định. Phiếu nhập cũ
          chưa khai báo số đã trả được đếm riêng, không mặc định đã trả hay chưa trả. Tên nhà cung cấp được nhập khi lập phiếu đặt.
        </Typography>
      </MainCard>
      {supplier && (
        <Dialog open fullWidth maxWidth="lg" onClose={() => setSupplier(null)}>
          <DialogTitle>Lịch sử · {supplier}</DialogTitle>
          <DialogContent>
            <DataTable
              rows={documents.filter((d) => d.manufacturer_name === supplier)}
              onRow={(d) => setDetail(d.receipt_id)}
              columns={[
                { key: 'code', label: 'Mã phiếu', render: docCode },
                { key: 'type', label: 'Loại', render: (d) => typeLabel[d.receipt_type] },
                { key: 'date', label: 'Ngày lập', render: (d) => when(d.receipt_date) },
                { key: 'amount', label: 'Tổng tiền', align: 'right', render: (d) => money(d.total_amount) },
                { key: 'status', label: 'Trạng thái', render: (d) => <Status value={d.status} /> }
              ]}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSupplier(null)}>Đóng</Button>
          </DialogActions>
        </Dialog>
      )}
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

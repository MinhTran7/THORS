import { useState } from 'react';
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, TextField, Typography } from '@mui/material';
import MainCard from 'components/MainCard';
import { useWarehouse } from './WarehouseContext';
import { DataTable, Status, Title } from './components';
import { docCode, money, number, textMatches, totalQty, typeLabel, when } from './model';
import { DocumentAction, DocumentDetail } from './DocumentsPage';
import DocumentForm from './DocumentForm';
export default function SuppliersPage() {
  const { documents } = useWarehouse();
  const [tab, setTab] = useState('receipts');
  const [search, setSearch] = useState('');
  const [supplier, setSupplier] = useState(null);
  const [detail, setDetail] = useState(null);
  const [edit, setEdit] = useState(null);
  const [action, setAction] = useState(null);
  const allNames = [...new Set(documents.filter((d) => d.manufacturer_name).map((d) => d.manufacturer_name))].sort((a, b) =>
    a.localeCompare(b, 'vi')
  );
  // Không phân biệt hoa/thường và dấu: "giay dong" tìm ra "Giày Dép Đồng Xuân".
  const names = allNames.filter((n) => textMatches(n, search));
  const sum = (list, f) => list.reduce((n, d) => n + Number(f(d) || 0), 0);

  // Nhập hàng: what the shop bought from the supplier and still owes them.
  const receiptRows = names.map((name) => {
    const docs = documents.filter((d) => d.manufacturer_name === name);
    const receipts = docs.filter((d) => d.receipt_type === 'RECEIPT' && d.status === 'CONFIRMED');
    // Exchange receipts (source = a return) are paid by the returned goods: no money owed.
    const bought = receipts.filter((d) => d.source_type === 'PURCHASE_ORDER');
    // Old receipts (e.g. imported from Excel) count as fully paid: the backend reports debt 0 for them.
    const debtOf = (d) => Number(d.debt_amount || 0);
    return {
      _key: name,
      name,
      orders: docs.filter((d) => d.receipt_type === 'PURCHASE_ORDER').length,
      receipts: receipts.length,
      quantity: sum(receipts, totalQty),
      amount: sum(bought, (d) => d.total_amount),
      paid: sum(bought, (d) => Number(d.total_amount) - debtOf(d)),
      debt: sum(bought, debtOf)
    };
  });

  // Trả hàng: what went back to the supplier and what they still owe the shop.
  const returnRows = names
    .map((name) => {
      const returns = documents.filter(
        (d) => d.manufacturer_name === name && d.receipt_type === 'SUPPLIER_RETURN' && !['REJECTED', 'CANCELLED'].includes(d.status)
      );
      const dispatched = returns.filter((d) => d.status === 'CONFIRMED');
      return {
        _key: name,
        name,
        returns: returns.length,
        waiting: returns.length - dispatched.length,
        quantity: sum(dispatched, totalQty),
        amount: sum(dispatched, (d) => d.total_amount),
        paid: sum(dispatched, (d) => d.settled_amount),
        owed: sum(dispatched, (d) => d.unsettled_amount)
      };
    })
    .filter((r) => r.returns > 0);

  const nameColumn = {
    key: 'name',
    label: 'Nhà cung cấp',
    render: (r) => (
      <Typography variant="subtitle2" color="primary">
        {r.name}
      </Typography>
    )
  };
  const total = (rows, key) => sum(rows, (r) => r[key]);

  return (
    <>
      <Title title="Nhà cung cấp" subtitle="Tổng hợp theo từng nhà cung cấp: hàng nhập và tiền mình còn nợ NCC, hàng trả và tiền NCC còn nợ mình." />
      <MainCard>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
          <Tab value="receipts" label="Nhập hàng" />
          <Tab value="returns" label="Trả hàng" />
        </Tabs>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2, alignItems: { sm: 'center' } }}>
          <Autocomplete
            freeSolo
            size="small"
            options={allNames}
            inputValue={search}
            onInputChange={(_, v) => setSearch(v)}
            filterOptions={(list, { inputValue }) => list.filter((n) => textMatches(n, inputValue))}
            sx={{ minWidth: 320 }}
            slotProps={{ listbox: { style: { maxHeight: 320 } } }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder="Tìm nhà cung cấp (không cần dấu)"
                slotProps={{ ...params.slotProps, htmlInput: { ...params.slotProps?.htmlInput, 'aria-label': 'Tìm nhà cung cấp' } }}
              />
            )}
          />
          <Typography variant="body2" color="text.secondary">
            {tab === 'receipts' ? 'Tổng mình còn nợ NCC: ' : 'Tổng NCC còn nợ mình: '}
            <b>{money(tab === 'receipts' ? total(receiptRows, 'debt') : total(returnRows, 'owed'))}</b>
          </Typography>
        </Stack>
        {tab === 'receipts' ? (
          <>
            <DataTable
              rows={receiptRows}
              onRow={(r) => setSupplier(r.name)}
              columns={[
                nameColumn,
                { key: 'orders', label: 'Phiếu đặt', align: 'right', render: (r) => number(r.orders) },
                { key: 'receipts', label: 'Phiếu nhập', align: 'right', render: (r) => number(r.receipts) },
                { key: 'quantity', label: 'Số lượng nhập', align: 'right', render: (r) => number(r.quantity) },
                { key: 'amount', label: 'Tiền hàng nhập', align: 'right', render: (r) => money(r.amount) },
                { key: 'paid', label: 'Đã trả NCC', align: 'right', render: (r) => money(r.paid) },
                {
                  key: 'debt',
                  label: 'Còn nợ NCC',
                  align: 'right',
                  render: (r) => <b>{money(r.debt)}</b>
                }
              ]}
            />
            <Typography variant="caption" color="text.secondary">
              Đã trả NCC gồm tiền đã thanh toán và phần được trừ bằng hàng trả.
            </Typography>
          </>
        ) : (
          <DataTable
            rows={returnRows}
            empty="Chưa có phiếu trả hàng nào."
            onRow={(r) => setSupplier(r.name)}
            columns={[
              nameColumn,
              {
                key: 'returns',
                label: 'Phiếu trả',
                align: 'right',
                render: (r) => (
                  <>
                    {number(r.returns)}
                    {r.waiting > 0 && (
                      <Typography variant="caption" color="text.secondary" component="div">
                        {number(r.waiting)} chưa xuất trả
                      </Typography>
                    )}
                  </>
                )
              },
              { key: 'quantity', label: 'Số lượng đã trả', align: 'right', render: (r) => number(r.quantity) },
              { key: 'amount', label: 'Tiền hàng trả', align: 'right', render: (r) => money(r.amount) },
              { key: 'paid', label: 'NCC đã trả', align: 'right', render: (r) => money(r.paid) },
              { key: 'owed', label: 'NCC còn nợ', align: 'right', render: (r) => <b>{money(r.owed)}</b> }
            ]}
          />
        )}
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

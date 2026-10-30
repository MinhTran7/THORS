import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { ActionDialog, DataTable, Metrics, Status, Title } from './components';
import DocumentForm from './DocumentForm';
import { docCode, handledQty, money, number, statusLabel, totalQty, typeLabel, variantLabel, when } from './model';

export function DocumentDetail({ id, onClose, onEdit, onAction }) {
  const { documents, owner, account, busy } = useWarehouse();
  const d = documents.find((x) => x.receipt_id === id);
  if (!d) return null;
  const canEdit = d.status === 'DRAFT' && (owner || (d.receipt_type === 'RECEIPT' && d.created_by === account.id));
  const source = documents.find((x) => x.receipt_id === d.source_receipt_id);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        {docCode(d)} · {typeLabel[d.receipt_type]} <Status value={d.status} />
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            Nhà sản xuất/nhà cung cấp: <b>{d.manufacturer_name}</b>
          </Typography>
          {source && (
            <Typography>
              Phiếu nguồn: <b>{docCode(source)}</b>
            </Typography>
          )}
          <Typography color="text.secondary">
            Người lập: {d.creator_name} · {when(d.receipt_date)}
            {d.confirmed_at && ` · Xác nhận: ${d.confirmer_name} · ${when(d.confirmed_at)}`}
          </Typography>
          {d.note && <Typography>Ghi chú: {d.note}</Typography>}
          {d.rejection_reason && <Alert severity="warning">Lý do: {d.rejection_reason}</Alert>}
          {d.close_reason && (
            <Alert severity="info">
              Đóng đơn: {d.close_reason} · {when(d.closed_at)}
            </Alert>
          )}
          <DataTable
            rows={d.items.map((i) => ({ ...i, _key: i.receipt_item_id }))}
            columns={[
              { key: 'product', label: 'Sản phẩm · màu · size', render: variantLabel },
              { key: 'quantity', label: 'Số lượng', align: 'right', render: (i) => number(i.quantity) },
              { key: 'unit_price', label: 'Đơn giá nhập', align: 'right', render: (i) => money(i.unit_price) },
              { key: 'amount', label: 'Thành tiền', align: 'right', render: (i) => money(i.quantity * i.unit_price) },
              ...(d.receipt_type !== 'SUPPLIER_RETURN'
                ? [
                    {
                      key: 'handled_quantity',
                      label: d.receipt_type === 'PURCHASE_ORDER' ? 'Đã nhận' : 'Đã trả NCC',
                      align: 'right',
                      render: (i) => number(i.handled_quantity)
                    },
                    {
                      key: 'remaining',
                      label: d.receipt_type === 'PURCHASE_ORDER' ? 'Còn thiếu' : 'Còn được trả',
                      align: 'right',
                      render: (i) => number(i.quantity - i.handled_quantity)
                    }
                  ]
                : [])
            ]}
          />
          <Typography variant="h5">
            Tổng: {number(totalQty(d))} sản phẩm · {money(d.total_amount)}
          </Typography>
          {d.receipt_type === 'PURCHASE_ORDER' && <Typography variant="subtitle2">Các đợt nhập liên quan</Typography>}
          {d.receipt_type === 'PURCHASE_ORDER' &&
            documents
              .filter((x) => x.source_receipt_id === d.receipt_id)
              .map((x) => (
                <Typography key={x.receipt_id}>
                  {docCode(x)} · {number(totalQty(x))} sản phẩm · {statusLabel[x.status]}
                </Typography>
              ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Đóng</Button>
        {canEdit && (
          <>
            <Button disabled={busy} onClick={() => onEdit(d)}>
              Sửa nháp
            </Button>
            <Button disabled={busy} onClick={() => onAction(d, 'submit')}>
              Gửi xác nhận
            </Button>
          </>
        )}
        {owner && ['DRAFT', 'PENDING_CONFIRMATION'].includes(d.status) && (
          <Button variant="contained" disabled={busy} onClick={() => onAction(d, 'confirm')}>
            Xác nhận phiếu
          </Button>
        )}
        {owner && d.status === 'PENDING_CONFIRMATION' && (
          <Button color="warning" disabled={busy} onClick={() => onAction(d, 'reject')}>
            Từ chối
          </Button>
        )}
        {owner && ['DRAFT', 'PENDING_CONFIRMATION'].includes(d.status) && (
          <Button color="error" disabled={busy} onClick={() => onAction(d, 'cancel')}>
            Hủy phiếu
          </Button>
        )}
        {owner && d.receipt_type === 'PURCHASE_ORDER' && d.status === 'CONFIRMED' && (
          <Button color="warning" onClick={() => onAction(d, 'close')}>
            Đóng đơn đặt
          </Button>
        )}
        {d.receipt_type === 'PURCHASE_ORDER' && d.status === 'CONFIRMED' && totalQty(d) > handledQty(d) && (
          <Button component={Link} to={`/warehouse/receipts?source=${d.receipt_id}`} onClick={onClose}>
            Lập đợt nhập
          </Button>
        )}
        {owner && d.receipt_type === 'RECEIPT' && d.status === 'CONFIRMED' && totalQty(d) > handledQty(d) && (
          <Button component={Link} to={`/warehouse/returns?source=${d.receipt_id}`} onClick={onClose}>
            Lập phiếu trả
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
const actionNames = {
  submit: 'Gửi xác nhận',
  confirm: 'Xác nhận phiếu',
  cancel: 'Hủy phiếu',
  reject: 'Từ chối phiếu',
  close: 'Đóng đơn đặt'
};
export function DocumentAction({ action, onClose }) {
  const { run } = useWarehouse();
  const { doc, kind } = action;
  return (
    <ActionDialog
      title={`${actionNames[kind]} ${docCode(doc)}`}
      reason={['cancel', 'reject', 'close'].includes(kind)}
      text={
        kind === 'confirm'
          ? doc.receipt_type === 'PURCHASE_ORDER'
            ? 'Xác nhận đơn đặt để bắt đầu lập các đợt nhập. Tồn kho chưa thay đổi.'
            : doc.receipt_type === 'RECEIPT'
              ? 'Xác nhận số thực nhận trên phiếu. Tổng tồn sẽ tăng một lần theo đúng từng màu/size; phiếu sẽ không sửa được.'
              : 'Xác nhận trả nhà cung cấp. Tổng tồn và số lượng tại vị trí sẽ giảm; phiếu sẽ không sửa được.'
          : kind === 'close'
            ? 'Đóng đơn đặt và ghi nhận phần chưa được giao. Không thể lập thêm đợt nhập cho đơn đã đóng.'
            : 'Thao tác sẽ được lưu vào lịch sử chứng từ.'
      }
      onClose={onClose}
      onConfirm={(reason) =>
        run(
          () =>
            api(`/warehouse/documents/${doc.receipt_id}/${kind}`, {
              method: 'POST',
              ...(['cancel', 'reject', 'close'].includes(kind) ? { body: { reason } } : {})
            }),
          'Đã cập nhật trạng thái phiếu.'
        )
      }
    />
  );
}
export default function DocumentsPage({ type }) {
  const { documents, owner } = useWarehouse();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const [action, setAction] = useState(null);
  const source = documents.find((d) => d.receipt_id === Number(params.get('source')));
  const docs = documents.filter((d) => d.receipt_type === type);
  const filtered = docs.filter(
    (d) =>
      (!status || d.status === status) &&
      `${docCode(d)} ${d.manufacturer_name || ''} ${d.creator_name}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))
  );
  const canCreate = owner || type === 'RECEIPT';
  const closeForm = () => {
    setForm(null);
    if (params.has('source')) {
      params.delete('source');
      setParams(params, { replace: true });
    }
  };
  return (
    <>
      <Title
        title={type === 'PURCHASE_ORDER' ? 'Đặt hàng nhập' : type === 'RECEIPT' ? 'Nhập hàng' : 'Trả hàng nhập'}
        subtitle={
          type === 'PURCHASE_ORDER'
            ? 'Đặt theo từng màu/size, theo dõi số đã giao và còn thiếu qua từng đợt.'
            : type === 'RECEIPT'
              ? 'Lập phiếu từ đơn đặt; Owner xác nhận số hàng thực nhận.'
              : 'Trả nhà cung cấp dựa trên phiếu nhập đã xác nhận.'
        }
        action={
          canCreate && (
            <Button variant="contained" onClick={() => setForm({})}>
              Tạo {typeLabel[type].toLowerCase()}
            </Button>
          )
        }
      />
      <Metrics
        items={[
          ['Tổng số phiếu', docs.length, 'Trong loại chứng từ này'],
          ['Chờ xác nhận', docs.filter((d) => d.status === 'PENDING_CONFIRMATION').length, 'Cần chủ cửa hàng xử lý'],
          [
            type === 'PURCHASE_ORDER' ? 'Còn thiếu' : 'Số lượng đã xác nhận',
            docs
              .filter((d) => d.status === 'CONFIRMED')
              .reduce((n, d) => n + (type === 'PURCHASE_ORDER' ? totalQty(d) - handledQty(d) : totalQty(d)), 0),
            type === 'PURCHASE_ORDER' ? 'Trên các đơn đặt đang mở' : 'Tính theo số thực nhận / thực trả'
          ]
        ]}
      />
      <MainCard>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder="Tìm mã phiếu, nhà cung cấp, người lập"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ minWidth: 280, flex: 1 }}
            slotProps={{ htmlInput: { 'aria-label': 'Tìm chứng từ' } }}
          />
          <TextField
            size="small"
            select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 180 }}
            slotProps={{ select: { displayEmpty: true, inputProps: { 'aria-label': 'Lọc trạng thái' } } }}
          >
            <MenuItem value="">Tất cả trạng thái</MenuItem>
            {['DRAFT', 'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'CANCELLED', ...(type === 'PURCHASE_ORDER' ? ['CLOSED'] : [])].map(
              (s) => (
                <MenuItem key={s} value={s}>
                  {statusLabel[s]}
                </MenuItem>
              )
            )}
          </TextField>
        </Stack>
        <DataTable
          rows={filtered}
          onRow={(d) => setDetail(d.receipt_id)}
          columns={[
            {
              key: 'code',
              label: 'Mã phiếu',
              render: (d) => (
                <Typography color="primary" variant="subtitle2">
                  {docCode(d)}
                </Typography>
              )
            },
            { key: 'manufacturer_name', label: 'Nhà sản xuất / nhà cung cấp' },
            { key: 'receipt_date', label: 'Ngày lập', render: (d) => when(d.receipt_date) },
            { key: 'quantity', label: 'Số lượng', align: 'right', render: (d) => number(totalQty(d)) },
            ...(type === 'PURCHASE_ORDER'
              ? [
                  {
                    key: 'handled',
                    label: 'Đã nhận / Còn thiếu',
                    render: (d) => `${number(handledQty(d))} / ${number(totalQty(d) - handledQty(d))}`
                  }
                ]
              : []),
            { key: 'total', label: 'Tổng tiền', align: 'right', render: (d) => money(d.total_amount) },
            { key: 'status', label: 'Trạng thái', render: (d) => <Status value={d.status} /> }
          ]}
        />
      </MainCard>
      {!owner && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Bạn được xem dữ liệu kho và lập/sửa phiếu nhập nháp do mình tạo. Chủ cửa hàng xác nhận và thay đổi tồn kho.
        </Alert>
      )}
      {detail && (
        <DocumentDetail
          id={detail}
          onClose={() => setDetail(null)}
          onEdit={(d) => {
            setDetail(null);
            setForm({ document: d });
          }}
          onAction={(doc, kind) => setAction({ doc, kind })}
        />
      )}
      {(form || source) && canCreate && (
        <DocumentForm
          key={`${type}-${form?.document?.receipt_id || source?.receipt_id || 'new'}`}
          type={type}
          document={form?.document}
          source={source}
          onClose={closeForm}
        />
      )}
      {action && <DocumentAction action={action} onClose={() => setAction(null)} />}
    </>
  );
}

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useSWR from 'swr';
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  MenuItem,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import MainCard from 'components/MainCard';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { ActionDialog, DataTable, Metrics, Status, Title } from './components';
import DocumentForm from './DocumentForm';
import OrderDetail from './OrderDetail';
import ReturnDispatchDialog from './ReturnDispatchDialog';
import SettlementPanel, { SettlementStatus } from './SettlementPanel';
import { docCode, handledQty, money, number, returnableQty, statusText, totalQty, typeLabel, variantLabel, when } from './model';

const historyNames = {
  DOCUMENT_CREATE: 'Lập phiếu',
  DOCUMENT_EDIT: 'Sửa nháp',
  DOCUMENT_SUBMIT: 'Gửi duyệt',
  DOCUMENT_APPROVE: 'Duyệt phiếu',
  DOCUMENT_DISPATCH: 'Xác nhận xuất trả',
  DOCUMENT_CONFIRM: 'Xác nhận',
  DOCUMENT_REJECT: 'Từ chối',
  DOCUMENT_CANCEL: 'Hủy phiếu',
  DOCUMENT_REFUND: 'Nhận hoàn tiền',
  DOCUMENT_DEBT_OFFSET: 'Giảm công nợ',
  DOCUMENT_CREDIT_HOLD: 'Giữ tiền đối trừ',
  DOCUMENT_CREDIT_USE: 'Dùng tiền đối trừ',
  DOCUMENT_EXCHANGE: 'Đổi hàng',
  DOCUMENT_SETTLEMENT_VOID: 'Hủy bút toán',
  DOCUMENT_PAYMENT: 'Thanh toán nhập hàng',
  DOCUMENT_PAYMENT_BASIS: 'Khai báo số đã trả trước khi theo dõi'
};
const moneyActions = ['DOCUMENT_PAYMENT', 'DOCUMENT_REFUND', 'DOCUMENT_DEBT_OFFSET', 'DOCUMENT_CREDIT_HOLD', 'DOCUMENT_CREDIT_USE', 'DOCUMENT_EXCHANGE'];

// Audit trail + stock movements of a supplier return, from the existing audit_log/stock_adjustment.
function ReturnHistory({ id }) {
  const { data, error } = useSWR(`/warehouse/documents/${id}/history`, api);
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (!data) return <Typography color="text.secondary">Đang tải lịch sử…</Typography>;
  return (
    <Stack spacing={1}>
      <Typography variant="subtitle2">Lịch sử thao tác</Typography>
      {data.actions.map((h, index) => (
        <Typography key={index} variant="body2">
          {when(h.performed_at)} · {historyNames[h.action_type] || h.action_type} · {h.actor_name || 'Hệ thống'}
          {['DOCUMENT_REJECT', 'DOCUMENT_CANCEL', 'DOCUMENT_SETTLEMENT_VOID', 'DOCUMENT_PAYMENT_BASIS'].includes(h.action_type) && h.new_value ? ` · ${h.new_value}` : ''}
          {moneyActions.includes(h.action_type) && h.new_value ? ` · ${money(h.new_value)}` : ''}
        </Typography>
      ))}
      {data.movements.length > 0 && (
        <>
          <Typography variant="subtitle2">Lịch sử kho (vị trí đã lấy hàng)</Typography>
          <DataTable
            rows={data.movements.map((m) => ({ ...m, _key: m.adjustment_id }))}
            columns={[
              { key: 'adjusted_at', label: 'Thời điểm', render: (m) => when(m.adjusted_at) },
              { key: 'variant', label: 'Sản phẩm · màu · size', render: variantLabel },
              {
                key: 'location',
                label: 'Vị trí lấy',
                render: (m) => (m.source_location_id ? `${m.rack_code}${m.level_number}` : 'Chưa xếp vị trí')
              },
              { key: 'quantity_change', label: 'Thay đổi tồn', align: 'right', render: (m) => number(m.quantity_change) },
              { key: 'actor_name', label: 'Người thực hiện' }
            ]}
          />
        </>
      )}
    </Stack>
  );
}

export function DocumentDetail({ id, onClose, onEdit, onAction, readOnly = false }) {
  const { documents, owner, account, busy } = useWarehouse();
  const [nested, setNested] = useState(null);
  const [returnForm, setReturnForm] = useState(false);
  const d = documents.find((x) => x.receipt_id === id);
  if (!d) return null;
  if (d.receipt_type === 'SUPPLIER_RETURN') return <ReturnDetail d={d} onClose={onClose} onEdit={onEdit} onAction={onAction} readOnly={readOnly} />;
  if (d.receipt_type === 'PURCHASE_ORDER')
    return (
      <>
        <OrderDetail id={id} onClose={onClose} onEdit={onEdit} onAction={onAction} onOpenDocument={setNested} />
        {nested && <DocumentDetail id={nested} readOnly onClose={() => setNested(null)} />}
      </>
    );
  // readOnly: opened as a link from another document; actions belong to the document's own page.
  const canAct = !readOnly;
  const canEdit = canAct && d.status === 'DRAFT' && (owner || (d.receipt_type === 'RECEIPT' && d.created_by === account.id));
  const source = documents.find((x) => x.receipt_id === d.source_receipt_id);
  const canReturn = canAct && d.receipt_type === 'RECEIPT' && d.status === 'CONFIRMED' && d.items.some((i) => returnableQty(i) > 0);
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
              {d.receipt_type === 'RECEIPT' &&
                (source.receipt_type === 'SUPPLIER_RETURN'
                  ? ' · Phiếu nhập hàng đổi: nhận lại hàng nhà cung cấp đổi cho phiếu trả.'
                  : ' · Đơn giá theo phiếu đặt; số lượng là số thực nhận được chấp nhận.')}
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
                      render: (i) => number(d.receipt_type === 'PURCHASE_ORDER' ? i.quantity - i.handled_quantity : returnableQty(i))
                    }
                  ]
                : [])
            ]}
          />
          <Typography variant="h5">
            Tổng: {number(totalQty(d))} sản phẩm · {money(d.total_amount)}
          </Typography>
          {d.receipt_type === 'RECEIPT' && d.status === 'CONFIRMED' && <SettlementPanel doc={d} readOnly={readOnly} />}
          {d.receipt_type === 'PURCHASE_ORDER' && <Typography variant="subtitle2">Các đợt nhập liên quan</Typography>}
          {d.receipt_type === 'PURCHASE_ORDER' &&
            documents
              .filter((x) => x.source_receipt_id === d.receipt_id)
              .map((x) => (
                <Typography key={x.receipt_id}>
                  {docCode(x)} · {number(totalQty(x))} sản phẩm · {statusText(x.status, x.receipt_type)}
                </Typography>
              ))}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Đóng</Button>
        {canReturn && (
          <Button variant="outlined" disabled={busy} onClick={() => setReturnForm(true)}>
            Trả hàng nhà cung cấp
          </Button>
        )}
        {canEdit && (
          <>
            <Button disabled={busy} onClick={() => onEdit(d)}>
              Sửa nháp
            </Button>
            {/* Owner confirms drafts directly; only Family sends a draft for confirmation. */}
            {!owner && (
              <Button disabled={busy} onClick={() => onAction(d, 'submit')}>
                Gửi xác nhận
              </Button>
            )}
          </>
        )}
        {canAct && owner && ['DRAFT', 'PENDING_CONFIRMATION'].includes(d.status) && (
          <Button variant="contained" disabled={busy} onClick={() => onAction(d, 'confirm')}>
            {confirmLabel[d.receipt_type]}
          </Button>
        )}
        {canAct && owner && d.status === 'PENDING_CONFIRMATION' && (
          <Button color="warning" disabled={busy} onClick={() => onAction(d, 'reject')}>
            Từ chối
          </Button>
        )}
        {canAct && owner && ['DRAFT', 'PENDING_CONFIRMATION'].includes(d.status) && (
          <Button color="error" disabled={busy} onClick={() => onAction(d, 'cancel')}>
            Hủy phiếu
          </Button>
        )}
      </DialogActions>
      {returnForm && <DocumentForm type="SUPPLIER_RETURN" source={d} onClose={() => setReturnForm(false)} />}
    </Dialog>
  );
}

function ReturnDetail({ d, onClose, onEdit, onAction, readOnly }) {
  const { documents, owner, account, busy } = useWarehouse();
  const [nested, setNested] = useState(null);
  const source = documents.find((x) => x.receipt_id === d.source_receipt_id);
  const canAct = !readOnly;
  const mine = d.created_by === account.id;
  const canEdit = canAct && d.status === 'DRAFT' && (owner || mine);
  const hasReason = Boolean(d.note?.trim());
  const pending = ['DRAFT', 'PENDING_CONFIRMATION'].includes(d.status);
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>
        {docCode(d)} · {typeLabel[d.receipt_type]} <Status value={d.status} type={d.receipt_type} />
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <Typography>
            Nhà cung cấp: <b>{d.manufacturer_name}</b> · Kho xuất trả: <b>Kho cửa hàng</b>
          </Typography>
          {source && (
            <Typography>
              Phiếu nhập gốc:{' '}
              <MuiLink component="button" type="button" onClick={() => setNested(source.receipt_id)}>
                {docCode(source)}
              </MuiLink>{' '}
              · Ngày nhập: {when(source.confirmed_at || source.receipt_date)}
            </Typography>
          )}
          <Typography>
            Lý do trả hàng: {hasReason ? d.note : <Typography component="span" color="error">chưa nhập</Typography>}
          </Typography>
          <Typography color="text.secondary">
            Người lập: {d.creator_name} · {when(d.receipt_date)}
            {d.confirmed_at && ` · Người duyệt: ${d.confirmer_name} · ${when(d.confirmed_at)}`}
            {d.status === 'CONFIRMED' && ` · Xuất trả: ${when(d.dispatched_at)}`}
          </Typography>
          {d.rejection_reason && <Alert severity="warning">Lý do: {d.rejection_reason}</Alert>}
          <DataTable
            rows={d.items.map((i) => ({ ...i, _key: i.receipt_item_id }))}
            columns={[
              { key: 'product', label: 'Sản phẩm · màu · size', render: variantLabel },
              { key: 'quantity', label: 'Số lượng trả', align: 'right', render: (i) => number(i.quantity) },
              { key: 'unit_price', label: 'Đơn giá trả', align: 'right', render: (i) => money(i.unit_price) },
              { key: 'amount', label: 'Thành tiền', align: 'right', render: (i) => money(i.quantity * i.unit_price) }
            ]}
          />
          <Typography variant="h5">
            Tổng: {number(totalQty(d))} sản phẩm · {money(d.total_amount)}
          </Typography>
          <SettlementPanel doc={d} readOnly={readOnly} />
          {canAct && pending && !hasReason && (
            <Alert severity="warning">Nhập lý do trả hàng (Sửa nháp) trước khi gửi duyệt hoặc xác nhận.</Alert>
          )}
          <ReturnHistory id={d.receipt_id} />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose}>Đóng</Button>
        {canEdit && (
          <Button disabled={busy} onClick={() => onEdit(d)}>
            Sửa nháp
          </Button>
        )}
        {/* Family sends drafts for approval; the owner never has to send a draft to themselves. */}
        {canEdit && !owner && (
          <Button variant="contained" disabled={busy || !hasReason} onClick={() => onAction(d, 'submit')}>
            Gửi duyệt
          </Button>
        )}
        {canAct && owner && pending && (
          <>
            <Button variant="outlined" disabled={busy || !hasReason} onClick={() => onAction(d, 'approve')}>
              {d.status === 'DRAFT' ? 'Xác nhận phiếu' : 'Duyệt phiếu'}
            </Button>
            <Button variant="contained" disabled={busy || !hasReason} onClick={() => onAction(d, 'dispatch')}>
              {d.status === 'DRAFT' ? 'Xác nhận và xuất trả' : 'Duyệt và xuất trả'}
            </Button>
          </>
        )}
        {canAct && owner && d.status === 'APPROVED' && (
          <Button variant="contained" disabled={busy} onClick={() => onAction(d, 'dispatch')}>
            Xác nhận xuất trả
          </Button>
        )}
        {canAct && owner && d.status === 'PENDING_CONFIRMATION' && (
          <Button color="warning" disabled={busy} onClick={() => onAction(d, 'reject')}>
            Từ chối
          </Button>
        )}
        {canAct && owner && (pending || d.status === 'APPROVED') && (
          <Button color="error" disabled={busy} onClick={() => onAction(d, 'cancel')}>
            Hủy phiếu
          </Button>
        )}
      </DialogActions>
      {nested && <DocumentDetail id={nested} readOnly onClose={() => setNested(null)} />}
    </Dialog>
  );
}
export const confirmLabel = {
  PURCHASE_ORDER: 'Xác nhận đặt hàng',
  RECEIPT: 'Xác nhận nhập hàng',
  SUPPLIER_RETURN: 'Xác nhận xuất trả'
};
const actionNames = {
  submit: 'Gửi xác nhận',
  cancel: 'Hủy phiếu',
  reject: 'Từ chối phiếu',
  close: 'Đóng đơn đặt',
  copy: 'Sao chép thành phiếu nháp'
};
// Remaining quantity of each source order line as displayed now; the backend refuses the
// confirmation if another receipt changed it meanwhile (WAREHOUSE_STALE).
const expectedRemaining = (doc, documents) => {
  const source = documents.find((x) => x.receipt_id === doc.source_receipt_id);
  const result = {};
  (doc.items || []).forEach((i) => {
    const line = source?.items?.find((s) => s.receipt_item_id === i.source_receipt_item_id);
    if (line) result[line.receipt_item_id] = Math.max(0, line.quantity - line.handled_quantity);
  });
  return result;
};
export function DocumentAction({ action, onClose, onDone }) {
  const { run, documents } = useWarehouse();
  const { doc, kind } = action;
  const confirmedOrder = doc.receipt_type === 'PURCHASE_ORDER' && doc.status === 'CONFIRMED';
  const isReturn = doc.receipt_type === 'SUPPLIER_RETURN';
  // Dispatching a supplier return needs the pick locations, so it has its own dialog.
  if (kind === 'dispatch') return <ReturnDispatchDialog doc={doc} onClose={onClose} onDone={onDone} />;
  return (
    <ActionDialog
      title={`${
        kind === 'confirm'
          ? confirmLabel[doc.receipt_type]
          : kind === 'approve'
            ? doc.status === 'DRAFT'
              ? 'Xác nhận phiếu'
              : 'Duyệt phiếu'
            : isReturn && kind === 'submit'
              ? 'Gửi duyệt'
              : actionNames[kind]
      } ${docCode(doc)}`}
      reason={['cancel', 'reject', 'close'].includes(kind)}
      text={
        kind === 'approve'
          ? 'Phiếu chuyển sang “Chờ xuất trả”. Tồn kho chưa thay đổi; số lượng trên phiếu được giữ chỗ để không phiếu trả khác vượt số đã nhập. Tồn chỉ giảm khi xác nhận xuất trả.'
          : isReturn && kind === 'submit'
            ? 'Gửi phiếu cho chủ cửa hàng duyệt. Tồn kho chưa thay đổi.'
            : kind === 'confirm'
          ? doc.receipt_type === 'PURCHASE_ORDER'
            ? 'Xác nhận đơn đặt để bắt đầu lập các đợt nhập. Tồn kho chưa thay đổi.'
            : doc.receipt_type === 'RECEIPT'
              ? 'Xác nhận số thực nhận trên phiếu. Tổng tồn sẽ tăng một lần theo đúng từng màu/size; phiếu sẽ không sửa được.'
              : 'Xác nhận trả nhà cung cấp. Tổng tồn và số lượng tại vị trí sẽ giảm; phiếu sẽ không sửa được.'
          : kind === 'close'
            ? 'Đóng đơn đặt và ghi nhận phần chưa được giao (giữ nguyên số đặt và lịch sử nhập). Không thể lập thêm đợt nhập cho đơn đã đóng.'
            : kind === 'copy'
              ? 'Tạo phiếu đặt nháp mới với cùng nhà cung cấp, dòng hàng, số lượng và đơn giá. Không mang theo lịch sử nhận hoặc duyệt.'
              : kind === 'cancel' && confirmedOrder
                ? 'Hủy đơn đặt đã xác nhận nhưng chưa có hàng nhập thực tế. Các phiếu nhập nháp/chờ duyệt phải được xử lý trước.'
                : kind === 'submit' && doc.receipt_type === 'PURCHASE_ORDER'
                  ? 'Gửi phiếu đặt cho chủ cửa hàng xác nhận. Sau khi gửi bạn không sửa được nữa; chủ cửa hàng có thể sửa trước khi xác nhận.'
                  : 'Thao tác sẽ được lưu vào lịch sử chứng từ.'
      }
      onClose={onClose}
      onConfirm={async (reason) => {
        const result = await run(
          () =>
            api(`/warehouse/documents/${doc.receipt_id}/${kind}`, {
              method: 'POST',
              ...(['cancel', 'reject', 'close'].includes(kind)
                ? { body: { reason } }
                : kind === 'confirm' && doc.receipt_type === 'RECEIPT' && doc.source_type === 'PURCHASE_ORDER'
                  ? { body: { expectedRemaining: expectedRemaining(doc, documents) } }
                  : {})
            }),
          kind === 'copy' ? 'Đã tạo phiếu đặt nháp mới.' : 'Đã cập nhật trạng thái phiếu.'
        );
        onDone?.(result);
      }}
    />
  );
}
export default function DocumentsPage({ type }) {
  const { documents, owner } = useWarehouse();
  const [params] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  // ?id= opens a document directly (links from the stock card).
  const [detail, setDetail] = useState(() => (params.get('id') ? Number(params.get('id')) : null));
  const [form, setForm] = useState(null);
  const [action, setAction] = useState(null);
  const [sourceView, setSourceView] = useState(null);
  const isReturn = type === 'SUPPLIER_RETURN';
  const docs = documents.filter((d) => d.receipt_type === type);
  const sourceOf = (d) => documents.find((x) => x.receipt_id === d.source_receipt_id);
  const filtered = docs.filter(
    (d) =>
      (!status || d.status === status) &&
      `${docCode(d)} ${isReturn && sourceOf(d) ? docCode(sourceOf(d)) : ''} ${d.manufacturer_name || ''} ${d.creator_name}`
        .toLocaleLowerCase('vi')
        .includes(search.toLocaleLowerCase('vi'))
  );
  // Family members draft receipts and supplier returns; the backend enforces the same rule.
  const canCreate = owner || type === 'RECEIPT' || isReturn;
  const closeForm = () => setForm(null);
  return (
    <>
      <Title
        title={type === 'PURCHASE_ORDER' ? 'Đặt hàng nhập' : type === 'RECEIPT' ? 'Nhập hàng' : 'Trả hàng nhà cung cấp'}
        subtitle={
          type === 'PURCHASE_ORDER'
            ? 'Đặt theo từng màu/size, theo dõi số đã giao và còn thiếu qua từng đợt.'
            : type === 'RECEIPT'
              ? 'Lập phiếu từ đơn đặt; Owner xác nhận số hàng thực nhận.'
              : 'Trả hàng cho nhà cung cấp theo phiếu nhập đã xác nhận: lập phiếu, duyệt, rồi xác nhận xuất trả tại vị trí lấy hàng.'
        }
        action={
          canCreate && (
            <Button variant="contained" onClick={() => setForm({})}>
              {isReturn ? 'Tạo phiếu trả' : `Tạo ${typeLabel[type].toLowerCase()}`}
            </Button>
          )
        }
      />
      <Metrics
        items={
          isReturn
            ? [
                ['Tổng số phiếu', docs.length, 'Phiếu trả hàng nhà cung cấp'],
                ['Chờ duyệt', docs.filter((d) => d.status === 'PENDING_CONFIRMATION').length, 'Cần chủ cửa hàng duyệt'],
                ['Chờ xuất trả', docs.filter((d) => d.status === 'APPROVED').length, 'Đã duyệt, chưa giao hàng cho nhà cung cấp'],
                [
                  'Số lượng đã xuất trả',
                  docs.filter((d) => d.status === 'CONFIRMED').reduce((n, d) => n + totalQty(d), 0),
                  'Tổng số sản phẩm đã trả nhà cung cấp'
                ]
              ]
            : [
          ['Tổng số phiếu', docs.length, 'Trong loại chứng từ này'],
          ['Chờ xác nhận', docs.filter((d) => d.status === 'PENDING_CONFIRMATION').length, 'Cần chủ cửa hàng xử lý'],
          [
            type === 'PURCHASE_ORDER' ? 'Còn thiếu' : 'Số lượng đã xác nhận',
            docs
              .filter((d) => d.status === 'CONFIRMED')
              .reduce((n, d) => n + (type === 'PURCHASE_ORDER' ? totalQty(d) - handledQty(d) : totalQty(d)), 0),
            type === 'PURCHASE_ORDER' ? 'Trên các đơn đặt đang mở' : 'Tính theo số thực nhận'
          ],
          ...(type === 'RECEIPT'
            ? [
                [
                  'Số lượng đã xác nhận trả',
                  docs.filter((d) => d.status === 'CONFIRMED').reduce((n, d) => n + handledQty(d), 0),
                  'Đã xác nhận xuất trả nhà cung cấp'
                ]
              ]
            : [])
        ]
        }
      />
      <MainCard>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          <TextField
            size="small"
            placeholder={isReturn ? 'Tìm mã phiếu trả, mã phiếu nhập, nhà cung cấp, người lập' : 'Tìm mã phiếu, nhà cung cấp, người lập'}
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
            {[
              'DRAFT',
              'PENDING_CONFIRMATION',
              ...(isReturn ? ['APPROVED'] : []),
              'CONFIRMED',
              'REJECTED',
              'CANCELLED',
              ...(type === 'PURCHASE_ORDER' ? ['CLOSED'] : [])
            ].map((s) => (
              <MenuItem key={s} value={s}>
                {statusText(s, type)}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <DataTable
          rows={filtered}
          onRow={(d) => setDetail(d.receipt_id)}
          columns={
            isReturn
              ? [
                  {
                    key: 'code',
                    label: 'Mã phiếu trả',
                    render: (d) => (
                      <Typography color="primary" variant="subtitle2">
                        {docCode(d)}
                      </Typography>
                    )
                  },
                  {
                    key: 'source',
                    label: 'Phiếu nhập gốc',
                    render: (d) =>
                      sourceOf(d) ? (
                        <MuiLink
                          component="button"
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSourceView(d.source_receipt_id);
                          }}
                        >
                          {docCode(sourceOf(d))}
                        </MuiLink>
                      ) : (
                        '—'
                      )
                  },
                  { key: 'manufacturer_name', label: 'Nhà cung cấp' },
                  { key: 'receipt_date', label: 'Ngày lập', render: (d) => when(d.receipt_date) },
                  { key: 'quantity', label: 'Số lượng trả', align: 'right', render: (d) => number(totalQty(d)) },
                  { key: 'total', label: 'Tổng giá trị trả', align: 'right', render: (d) => money(d.total_amount) },
                  { key: 'status', label: 'Trạng thái phiếu', render: (d) => <Status value={d.status} type={type} /> },
                  {
                    key: 'settlement',
                    label: 'Tiền NCC trả lại',
                    render: (d) => (
                      <>
                        <SettlementStatus value={d.settlement_status} />
                        {d.status === 'CONFIRMED' && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            Đã nhận {money(d.settled_amount)} · Còn {money(d.unsettled_amount)}
                          </Typography>
                        )}
                      </>
                    )
                  }
                ]
              : [
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
              : type === 'RECEIPT'
                ? [
                    {
                      key: 'returned',
                      label: 'Đã xác nhận trả',
                      align: 'right',
                      // handled_quantity of a receipt line = dispatched (CONFIRMED) supplier returns only.
                      render: (d) => number(d.status === 'CONFIRMED' ? handledQty(d) : 0)
                    }
                  ]
                : []),
            { key: 'total', label: 'Tổng tiền', align: 'right', render: (d) => money(d.total_amount) },
            { key: 'status', label: 'Trạng thái', render: (d) => <Status value={d.status} /> }
          ]
          }
        />
      </MainCard>
      {!owner && (
        <Alert severity="info" sx={{ mt: 2 }}>
          Bạn được xem dữ liệu kho, lập/sửa phiếu nhập và phiếu trả nháp do mình tạo rồi gửi duyệt. Chủ cửa hàng duyệt, xác nhận và thay
          đổi tồn kho.
        </Alert>
      )}
      {sourceView && <DocumentDetail id={sourceView} readOnly onClose={() => setSourceView(null)} />}
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
      {form && canCreate && (
        <DocumentForm key={`${type}-${form.document?.receipt_id || 'new'}`} type={type} document={form.document} onClose={closeForm} />
      )}
      {action && <DocumentAction action={action} onClose={() => setAction(null)} />}
    </>
  );
}

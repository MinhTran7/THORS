import { useRef, useState } from 'react';
import useSWR from 'swr';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Typography } from '@mui/material';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { ActionDialog, Choice, DataTable, Field } from './components';
import {
  docCode,
  money,
  number,
  paymentMethodLabel,
  settlementStatusLabel,
  settlementTypeLabel,
  supplierKey,
  variantLabel,
  when
} from './model';

const statusColor = { UNSETTLED: 'warning', PARTIAL: 'info', SETTLED: 'success', NOT_APPLICABLE: 'default' };

export function SettlementStatus({ value }) {
  return <Chip size="small" variant="outlined" color={statusColor[value] || 'default'} label={settlementStatusLabel[value] || value} />;
}

const exchangeLeft = (i) => Number(i.quantity) - Number(i.exchanged_quantity || 0);
const today = () => new Date().toLocaleDateString('en-CA'); // yyyy-mm-dd in local time
const code = (prefix, id) => `${prefix}${String(id).padStart(5, '0')}`;

const intro = {
  PAYMENT: 'Ghi nhận số tiền cửa hàng đã thanh toán cho phiếu nhập này. Có thể thanh toán nhiều lần đến khi hết nợ.',
  REFUND: 'Ghi nhận số tiền nhà cung cấp đã hoàn lại. Có thể ghi nhiều lần cho đến khi đủ giá trị trả.',
  DEBT_OFFSET: 'Trừ giá trị hàng trả vào số còn nợ của một phiếu nhập cùng nhà cung cấp.',
  CREDIT_HOLD: 'Nhà cung cấp giữ lại số tiền này để đối trừ vào công nợ các phiếu nhập sau.',
  EXCHANGE:
    'Ghi nhận nhà cung cấp sẽ giao lại hàng cùng màu/size. Tồn kho chưa thay đổi: khi hàng về, lập phiếu nhập tại trang Nhập hàng với nguồn là phiếu trả này và chờ chủ cửa hàng xác nhận.',
  CREDIT_USE: 'Dùng tiền nhà cung cấp đang giữ để trừ vào số còn nợ của phiếu nhập này.'
};

function SettlementDialog({ doc, type, info, onClose }) {
  const { documents, run } = useWarehouse();
  const requestKey = useRef(crypto.randomUUID());
  const isReturn = doc.receipt_type === 'SUPPLIER_RETURN';
  // Debt offsets go to purchase receipts of the same supplier whose debt is known and open.
  const targets = documents.filter(
    (d) =>
      d.receipt_type === 'RECEIPT' && supplierKey(d.manufacturer_name) === supplierKey(doc.manufacturer_name) && Number(d.debt_amount) > 0
  );
  const exchangeable = isReturn ? doc.items.filter((i) => exchangeLeft(i) > 0) : [];
  const [target, setTarget] = useState(
    targets.some((t) => t.receipt_id === doc.source_receipt_id) ? doc.source_receipt_id : targets[0]?.receipt_id || ''
  );
  const [item, setItem] = useState(exchangeable[0]?.receipt_item_id || '');
  const [quantity, setQuantity] = useState('1');
  const [method, setMethod] = useState('CASH');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(false);

  const targetDebt = Number(documents.find((d) => d.receipt_id === Number(target))?.debt_amount || 0);
  const debt = Number(info.debt?.debt_amount || 0);
  const limit = {
    PAYMENT: debt,
    CREDIT_USE: Math.min(Number(info.supplier_credit), debt),
    DEBT_OFFSET: Math.min(Number(doc.unsettled_amount), targetDebt),
    REFUND: Number(doc.unsettled_amount),
    CREDIT_HOLD: Number(doc.unsettled_amount)
  }[type];
  const [amount, setAmount] = useState(String(Math.max(0, limit || 0)));
  const line = exchangeable.find((i) => i.receipt_item_id === Number(item));
  const exchangeAmount = line ? Number(quantity) * Number(line.unit_price) : 0;

  const problem =
    !date || date > today()
      ? 'Chọn ngày giao dịch, không sau hôm nay.'
      : type === 'EXCHANGE'
        ? !line
          ? 'Không còn dòng hàng nào có thể đổi.'
          : !Number.isInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > exchangeLeft(line)
            ? `Số lượng đổi từ 1 đến ${number(exchangeLeft(line))}.`
            : exchangeAmount > Number(doc.unsettled_amount)
              ? `Giá trị hàng đổi ${money(exchangeAmount)} vượt phần chưa xử lý ${money(doc.unsettled_amount)}.`
              : ''
        : type === 'DEBT_OFFSET' && !targets.length
          ? 'Không có phiếu nhập nào của nhà cung cấp này còn nợ (đã xác định). Khai báo số đã trả trước cho phiếu nhập cũ trước.'
          : !Number.isInteger(Number(amount)) || Number(amount) < 1 || Number(amount) > limit
            ? `Số tiền là số nguyên từ 1 đến ${money(limit)}.`
            : '';

  return (
    <Dialog open onClose={() => !waiting && onClose()} fullWidth maxWidth="sm">
      <DialogTitle>
        {settlementTypeLabel[type]} · {docCode(doc)}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">{intro[type]}</Typography>
          {type === 'DEBT_OFFSET' && targets.length > 0 && (
            <Choice label="Phiếu nhập được giảm công nợ" value={target} onChange={(e) => setTarget(e.target.value)}>
              {targets.map((t) => (
                <MenuItem key={t.receipt_id} value={t.receipt_id}>
                  {docCode(t)} · còn nợ {money(t.debt_amount)}
                </MenuItem>
              ))}
            </Choice>
          )}
          {type === 'EXCHANGE' && line && (
            <>
              <Choice label="Dòng hàng đổi" value={item} onChange={(e) => setItem(e.target.value)}>
                {exchangeable.map((i) => (
                  <MenuItem key={i.receipt_item_id} value={i.receipt_item_id}>
                    {variantLabel(i)} · còn đổi được {number(exchangeLeft(i))}
                  </MenuItem>
                ))}
              </Choice>
              <Field
                id="exchange-quantity"
                label="Số lượng nhà cung cấp sẽ đổi"
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                slotProps={{ htmlInput: { min: 1, max: exchangeLeft(line), step: 1 } }}
              />
              <Typography>Giá trị hàng đổi: {money(exchangeAmount)}</Typography>
            </>
          )}
          {type !== 'EXCHANGE' && (
            <Field
              id="settlement-amount"
              label="Số tiền (VNĐ)"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              helperText={`Tối đa ${money(limit)}`}
              slotProps={{ htmlInput: { min: 1, max: limit, step: 1 } }}
            />
          )}
          {['PAYMENT', 'REFUND'].includes(type) && (
            <Choice label="Hình thức" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(paymentMethodLabel).map(([k, v]) => (
                <MenuItem key={k} value={k}>
                  {v}
                </MenuItem>
              ))}
            </Choice>
          )}
          <Field
            id="settlement-date"
            label="Ngày giao dịch"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ htmlInput: { max: today() } }}
          />
          <Field
            id="settlement-note"
            label="Ghi chú (số chứng từ, người nhận…)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 255 } }}
          />
          {problem && <Alert severity="warning">{problem}</Alert>}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={waiting} onClick={onClose}>
          Quay lại
        </Button>
        <Button
          variant="contained"
          disabled={waiting || Boolean(problem)}
          onClick={async () => {
            setWaiting(true);
            setError('');
            try {
              await run(
                () =>
                  api('/warehouse/settlements', {
                    method: 'POST',
                    body: {
                      type,
                      returnId: isReturn ? doc.receipt_id : null,
                      targetReceiptId: type === 'DEBT_OFFSET' ? Number(target) : isReturn ? null : doc.receipt_id,
                      itemId: type === 'EXCHANGE' ? Number(item) : null,
                      quantity: type === 'EXCHANGE' ? Number(quantity) : null,
                      amount: type === 'EXCHANGE' ? null : Number(amount),
                      method: ['PAYMENT', 'REFUND'].includes(type) ? method : null,
                      date,
                      note: note.trim() || null,
                      requestKey: requestKey.current
                    }
                  }),
                `Đã ghi nhận: ${settlementTypeLabel[type].toLowerCase()}.`
              );
              onClose();
            } catch (e) {
              setError(e.message);
            } finally {
              setWaiting(false);
            }
          }}
        >
          {waiting ? 'Đang lưu…' : 'Ghi nhận'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Receipts confirmed before payment tracking: the Owner states what had already been paid.
function BasisDialog({ doc, debt, onClose }) {
  const { run } = useWarehouse();
  const max = Number(debt.value) - Number(debt.paid_amount) - Number(debt.offset_amount);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const bad = value === '' || !Number.isInteger(Number(value)) || Number(value) < 0 || Number(value) > max;
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Khai báo số đã thanh toán trước · {docCode(doc)}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography color="text.secondary">
            Phiếu nhập này được xác nhận trước khi hệ thống theo dõi công nợ, nên chưa biết đã trả nhà cung cấp bao nhiêu. Nhập số tiền đã
            trả trước đó theo sổ sách (0 nếu chưa trả). Hệ thống không tự giả định đã trả đủ hay chưa trả.
          </Typography>
          <Field
            id="paid-before"
            label="Số đã thanh toán trước khi theo dõi (VNĐ)"
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            helperText={`Từ 0 đến ${money(max)}`}
            slotProps={{ htmlInput: { min: 0, max, step: 1 } }}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Quay lại</Button>
        <Button
          variant="contained"
          disabled={bad}
          onClick={async () => {
            try {
              await run(
                () => api(`/warehouse/documents/${doc.receipt_id}/payment-basis`, { method: 'POST', body: { paidBefore: Number(value) } }),
                'Đã khai báo số đã thanh toán.'
              );
              onClose();
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Lưu khai báo
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const entryDetail = (e, docId) => {
  if (['PAYMENT', 'REFUND'].includes(e.settlement_type)) return paymentMethodLabel[e.payment_method];
  if (e.settlement_type === 'EXCHANGE') return `${variantLabel(e)} · ${number(e.quantity)} sản phẩm`;
  if (e.settlement_type === 'DEBT_OFFSET')
    return e.target_receipt_id === docId ? `Từ phiếu trả ${code('PT', e.return_id)}` : `Trừ vào ${code('PN', e.target_receipt_id)}`;
  if (e.settlement_type === 'CREDIT_USE') return `Trừ vào ${code('PN', e.target_receipt_id)}`;
  return '';
};

/** Money/exchange settlement of a dispatched return, or purchase debt and payments of a confirmed receipt. */
export default function SettlementPanel({ doc, readOnly = false }) {
  const { owner, busy, run } = useWarehouse();
  const { data, error } = useSWR(`/warehouse/documents/${doc.receipt_id}/settlements`, api);
  const [dialog, setDialog] = useState(null);
  const [basis, setBasis] = useState(false);
  const [voiding, setVoiding] = useState(null);
  const isReturn = doc.receipt_type === 'SUPPLIER_RETURN';
  if (isReturn && doc.status !== 'CONFIRMED')
    return (
      <Typography color="text.secondary">
        Xử lý tiền (hoàn tiền, giảm công nợ, giữ đối trừ) và đổi hàng thực hiện sau khi xác nhận xuất trả.
      </Typography>
    );
  if (error) return <Alert severity="error">{error.message}</Alert>;
  if (!data) return <Typography color="text.secondary">Đang tải công nợ / xử lý tiền…</Typography>;
  if (!isReturn && !data.debt)
    return (
      <Typography color="text.secondary">
        Phiếu nhập hàng đổi theo phiếu trả {code('PT', doc.source_receipt_id)}: hàng đổi đã được trừ bằng hàng trả, không phát sinh công nợ.
      </Typography>
    );
  const canAct = owner && !readOnly;
  const open = Number(doc.unsettled_amount || 0);
  const credit = Number(data.supplier_credit);
  const debt = data.debt;
  const known = debt && debt.debt_amount !== null && debt.debt_amount !== undefined;
  const figures = isReturn
    ? [
        ['Giá trị trả', money(doc.total_amount)],
        ['Đã nhận hoàn tiền', money(doc.refund_amount)],
        ['Đã giảm công nợ', money(doc.debt_offset_amount)],
        ['Giữ tiền đối trừ', money(doc.credit_hold_amount)],
        ['Giá trị hàng đổi', money(doc.exchange_amount)],
        ['Còn chưa xử lý', money(open)]
      ]
    : [
        ['Giá trị phiếu nhập', money(debt.value)],
        ['Đã trả trước khi theo dõi', debt.paid_before_tracking === null ? 'Chưa khai báo' : money(debt.paid_before_tracking)],
        ['Đã thanh toán', money(debt.paid_amount)],
        ['Đã đối trừ (hàng trả / tiền giữ)', money(debt.offset_amount)],
        ['Còn nợ', known ? money(debt.debt_amount) : 'Chưa xác định'],
        ['Tiền đối trừ NCC đang giữ', money(credit)]
      ];
  return (
    <Stack spacing={1.5}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="subtitle2">{isReturn ? 'Xử lý tiền / đổi hàng' : 'Công nợ nhà cung cấp'}</Typography>
        {isReturn && <SettlementStatus value={doc.settlement_status} />}
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
        {figures.map(([label, v]) => (
          <Typography key={label} variant="body2">
            {label}: <b>{v}</b>
          </Typography>
        ))}
      </Box>
      {isReturn &&
        doc.items
          .filter((i) => Number(i.exchanged_quantity) > 0)
          .map((i) => (
            <Typography key={i.receipt_item_id} variant="body2">
              Hàng đổi {variantLabel(i)}: nhà cung cấp đổi {number(i.exchanged_quantity)}, đã nhập kho {number(i.handled_quantity)} qua
              phiếu nhập
              {Number(i.exchanged_quantity) > Number(i.handled_quantity) &&
                ' · lập phiếu nhập từ phiếu trả này tại trang Nhập hàng khi hàng về'}
            </Typography>
          ))}
      {!isReturn && !known && (
        <Alert severity="warning">
          Phiếu nhập được xác nhận trước khi theo dõi công nợ nên chưa biết đã thanh toán bao nhiêu. Cần khai báo trước khi ghi thanh toán
          hoặc đối trừ.
        </Alert>
      )}
      {canAct && isReturn && open > 0 && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {['REFUND', 'DEBT_OFFSET', 'CREDIT_HOLD'].map((t) => (
            <Button key={t} size="small" variant="outlined" disabled={busy} onClick={() => setDialog(t)}>
              {settlementTypeLabel[t]}
            </Button>
          ))}
          {doc.items.some((i) => exchangeLeft(i) > 0) && (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => setDialog('EXCHANGE')}>
              {settlementTypeLabel.EXCHANGE}
            </Button>
          )}
        </Stack>
      )}
      {canAct && !isReturn && (
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
          {!known && (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => setBasis(true)}>
              Khai báo số đã thanh toán trước
            </Button>
          )}
          {known && Number(debt.debt_amount) > 0 && (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => setDialog('PAYMENT')}>
              Thanh toán
            </Button>
          )}
          {known && Number(debt.debt_amount) > 0 && credit > 0 && (
            <Button size="small" variant="outlined" disabled={busy} onClick={() => setDialog('CREDIT_USE')}>
              Dùng tiền đối trừ
            </Button>
          )}
        </Stack>
      )}
      {data.entries.length > 0 && (
        <DataTable
          rows={data.entries.map((e) => ({ ...e, _key: e.settlement_id }))}
          columns={[
            { key: 'transaction_date', label: 'Ngày', render: (e) => new Date(e.transaction_date).toLocaleDateString('vi-VN') },
            { key: 'type', label: 'Loại', render: (e) => settlementTypeLabel[e.settlement_type] },
            { key: 'detail', label: 'Chi tiết', render: (e) => entryDetail(e, doc.receipt_id) },
            { key: 'amount', label: 'Số tiền', align: 'right', render: (e) => money(e.amount) },
            { key: 'note', label: 'Ghi chú', render: (e) => e.note || '—' },
            { key: 'creator_name', label: 'Người ghi nhận', render: (e) => `${e.creator_name} · ${when(e.created_at)}` },
            {
              key: 'state',
              label: 'Trạng thái',
              render: (e) =>
                e.voided_at ? (
                  <Typography variant="body2" color="error">
                    Đã hủy · {e.voider_name} · {e.void_reason}
                  </Typography>
                ) : canAct ? (
                  <Button size="small" color="error" disabled={busy} onClick={() => setVoiding(e)}>
                    Hủy bút toán
                  </Button>
                ) : (
                  'Hiệu lực'
                )
            }
          ]}
        />
      )}
      {dialog && <SettlementDialog doc={doc} type={dialog} info={data} onClose={() => setDialog(null)} />}
      {basis && <BasisDialog doc={doc} debt={debt} onClose={() => setBasis(false)} />}
      {voiding && (
        <ActionDialog
          title={`Hủy bút toán ${settlementTypeLabel[voiding.settlement_type].toLowerCase()} ${money(voiding.amount)}`}
          text="Bút toán được giữ lại trong lịch sử với trạng thái đã hủy và không còn được tính vào công nợ / số đã xử lý."
          reason
          onClose={() => setVoiding(null)}
          onConfirm={(reason) =>
            run(() => api(`/warehouse/settlements/${voiding.settlement_id}/void`, { method: 'POST', body: { reason } }), 'Đã hủy bút toán.')
          }
        />
      )}
    </Stack>
  );
}

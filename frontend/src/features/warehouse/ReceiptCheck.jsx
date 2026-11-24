import { useRef, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { CameraOutlined, MinusOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { ActionDialog, DataTable } from './components';
import BarcodePrintDialog from './BarcodePrintDialog';
import CameraScanDialog from './CameraScanDialog';
import useBarcodeScanner from './useBarcodeScanner';
import { docCode, number, productCode, variantLabel } from './model';

const scannedOf = (i) => Number(i.scanned_quantity || 0);

/** Difference chip: what was scanned compared with the receipt line. */
function Difference({ line }) {
  const d = scannedOf(line) - Number(line.quantity);
  if (d === 0) return <Chip size="small" color="success" variant="outlined" label="Đủ" />;
  return (
    <Chip size="small" color={d < 0 ? 'warning' : 'error'} variant="outlined" label={d < 0 ? `Thiếu ${number(-d)}` : `Thừa ${number(d)}`} />
  );
}

/** Số đã đếm gõ tay: Enter hoặc rời ô thì lưu (bằng số đang có thì không gửi). */
function CountInput({ line, disabled, onSave }) {
  const [value, setValue] = useState(String(scannedOf(line)));
  const [last, setLast] = useState(scannedOf(line));
  if (scannedOf(line) !== last) {
    setLast(scannedOf(line));
    setValue(String(scannedOf(line)));
  }
  const commit = () => {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return setValue(String(scannedOf(line)));
    if (n !== scannedOf(line)) onSave(n);
  };
  return (
    <TextField
      size="small"
      type="number"
      value={value}
      disabled={disabled}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.target.blur())}
      slotProps={{ htmlInput: { min: 0, step: 1, 'aria-label': `Số đã đếm ${variantLabel(line)}`, style: { textAlign: 'center' } } }}
      sx={{ width: 76 }}
    />
  );
}

/**
 * Goods check of a receipt waiting for it ("Chờ kiểm hàng"). Each variant has one shared code: print as
 * many identical labels as pieces, stick them on, scan each one (+1), or type the counted number.
 * Stock increases only when the check is closed, by what was counted.
 * A USB/Bluetooth scanner works anywhere on the page; the code box is for typing a code by hand.
 */
export default function ReceiptCheck({ doc, readOnly }) {
  const { owner, reload } = useWarehouse();
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState(null);
  const [overCode, setOverCode] = useState('');
  // null | danh sách biến thể cần in tem (kèm số tem mặc định)
  const [printing, setPrinting] = useState(null);
  const [closing, setClosing] = useState(false);
  const [sending, setSending] = useState(false);
  const [camera, setCamera] = useState(false);
  const queue = useRef(Promise.resolve());
  const lines = doc.items || [];
  const expected = lines.reduce((n, i) => n + Number(i.quantity), 0);
  const scanned = lines.reduce((n, i) => n + scannedOf(i), 0);
  const differences = lines.filter((i) => scannedOf(i) !== Number(i.quantity));

  // Scans are sent one after another so fast scanning never loses a count.
  const send = (body) => {
    queue.current = queue.current.then(async () => {
      setSending(true);
      try {
        const line = await api(`/warehouse/documents/${doc.receipt_id}/scan`, { method: 'POST', body });
        const text = `${variantLabel(line)}: đã đếm ${number(line.scanned_quantity)} / ${number(line.quantity)}`;
        setNotice({ severity: scannedOf(line) > Number(line.quantity) ? 'warning' : 'success', text });
        setOverCode('');
        await reload();
        return { ok: true, message: text };
      } catch (e) {
        setNotice({ severity: 'error', text: e.message });
        // Over the receipt line: only the owner may accept the extra goods.
        setOverCode(e.code === 'SCAN_OVER' && owner && body.code ? body.code : '');
        return { ok: false, message: e.message };
      } finally {
        setSending(false);
      }
    });
    return queue.current;
  };
  const scan = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return Promise.resolve({ ok: false, message: 'Chưa đọc được mã.' });
    return send({ code: value });
  };
  const setCount = (line, quantity) =>
    send({ itemId: line.receipt_item_id, quantity, over: quantity > Number(line.quantity) || undefined });

  useBarcodeScanner(scan, !readOnly && !printing && !closing && !camera);

  // Mỗi biến thể một mã chung: N chiếc = N tem giống nhau. Mặc định in theo số trên phiếu.
  const printable = (i, labels) => ({
    ...i,
    product_code: productCode(i.product_id),
    unassigned_quantity: i.quantity,
    stock_quantity: i.quantity,
    labels
  });

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        <b>In tem → dán lên từng chiếc → quét từng tem</b> (mỗi lần quét +1). Các chiếc cùng màu, cùng size dùng chung một mã. Có thể gõ
        thẳng số đã đếm. Chỉ số đã đếm mới được nhập kho.
      </Alert>
      {!readOnly && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
          <Button variant="outlined" onClick={() => setPrinting(lines.map((i) => printable(i, Number(i.quantity))))}>
            In tem
          </Button>
          <TextField
            size="small"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                scan(code);
                setCode('');
              }
            }}
            placeholder="Máy quét: quét ở bất kỳ đâu trên trang · hoặc gõ mã hàng (ví dụ TH000052) rồi Enter"
            sx={{ flex: 1, minWidth: 240 }}
            slotProps={{ htmlInput: { 'aria-label': 'Mã tem kiểm hàng', maxLength: 64 } }}
          />
          <Button variant="outlined" startIcon={<CameraOutlined />} onClick={() => setCamera(true)} sx={{ whiteSpace: 'nowrap' }}>
            Quét bằng camera
          </Button>
          <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
            Đã đếm {number(scanned)} / {number(expected)}
          </Typography>
        </Stack>
      )}
      {notice && (
        <Alert
          severity={notice.severity}
          onClose={() => setNotice(null)}
          action={
            overCode && (
              <Button color="inherit" size="small" disabled={sending} onClick={() => send({ code: overCode, over: true })}>
                Vẫn nhận thừa
              </Button>
            )
          }
        >
          {notice.text}
        </Alert>
      )}
      <DataTable
        rows={lines.map((i) => ({ ...i, _key: i.receipt_item_id }))}
        columns={[
          { key: 'product', label: 'Sản phẩm · màu · size', render: variantLabel },
          {
            key: 'barcode',
            label: 'Mã biến thể',
            render: (i) =>
              i.barcode || (
                <Typography color="error" variant="caption">
                  Chưa có mã
                </Typography>
              )
          },
          { key: 'quantity', label: 'Trên phiếu', align: 'right', render: (i) => number(i.quantity) },
          {
            key: 'scanned',
            label: 'Đã đếm',
            align: 'right',
            render: (i) => (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                {readOnly ? (
                  <b>{number(scannedOf(i))}</b>
                ) : (
                  <>
                    <Tooltip title="Bớt 1 (lỡ quét nhầm / quét trùng)">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`Bớt 1 ${variantLabel(i)}`}
                          disabled={sending || scannedOf(i) === 0}
                          onClick={() => setCount(i, scannedOf(i) - 1)}
                        >
                          <MinusOutlined />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <CountInput line={i} disabled={sending} onSave={(n) => setCount(i, n)} />
                    <Tooltip title="In tem cho số còn thiếu của dòng này (tem hỏng, chưa dán)">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`In tem ${variantLabel(i)}`}
                          onClick={() => setPrinting([printable(i, Math.max(1, Number(i.quantity) - scannedOf(i)))])}
                        >
                          <PrinterOutlined />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title="In thêm 1 tem cho dòng này (NCC giao dư)">
                      <span>
                        <IconButton
                          size="small"
                          aria-label={`In thêm 1 tem ${variantLabel(i)}`}
                          onClick={() => setPrinting([printable(i, 1)])}
                        >
                          <PlusOutlined />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                )}
              </Stack>
            )
          },
          { key: 'diff', label: 'Chênh lệch', render: (i) => <Difference line={i} /> }
        ]}
      />
      {lines.some((i) => !i.barcode) && (
        <Typography variant="caption" color="text.secondary">
          Sản phẩm chưa có mã tem: tạo mã ở trang Tồn kho trước khi in.
        </Typography>
      )}
      {!readOnly && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            disabled={sending || scanned === 0 || (differences.length > 0 && !owner)}
            onClick={() => setClosing(true)}
          >
            Xác nhận nhập kho
          </Button>
        </Box>
      )}
      {!readOnly && differences.length > 0 && !owner && scanned > 0 && (
        <Alert severity="warning">Số quét khác số trên phiếu. Báo chủ cửa hàng kiểm tra và chốt phần chênh lệch.</Alert>
      )}
      {camera && <CameraScanDialog title={`Quét tem kiểm hàng ${docCode(doc)}`} onDetected={scan} onClose={() => setCamera(false)} />}
      {printing && <BarcodePrintDialog variants={printing} onClose={() => setPrinting(null)} />}
      {closing && (
        <ActionDialog
          title={`Xác nhận nhập kho ${docCode(doc)}`}
          reason={differences.length > 0}
          text={
            differences.length
              ? `Nhập kho ${number(scanned)} sản phẩm đã đếm (trên phiếu ${number(expected)}). Chênh lệch: ${differences
                  .map((i) => `${variantLabel(i)} ${scannedOf(i) - Number(i.quantity) > 0 ? '+' : ''}${scannedOf(i) - Number(i.quantity)}`)
                  .join('; ')}. Phần thiếu vẫn chờ nhận ở đơn đặt (hoặc đóng phần còn thiếu).`
              : `Nhập kho ${number(scanned)} sản phẩm, khớp phiếu. Tồn kho tăng ngay (phần chưa xếp vị trí).`
          }
          onClose={() => setClosing(false)}
          onConfirm={async (reason) => {
            await api(`/warehouse/documents/${doc.receipt_id}/receive`, { method: 'POST', body: { reason: reason || null } });
            setClosing(false);
            setNotice({ severity: 'success', text: 'Đã xác nhận nhập kho, tồn kho đã cập nhật.' });
            await reload();
          }}
        />
      )}
    </Stack>
  );
}

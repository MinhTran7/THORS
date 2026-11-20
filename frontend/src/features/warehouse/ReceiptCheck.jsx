import { useRef, useState } from 'react';
import { Alert, Box, Button, Chip, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { CameraOutlined, PlusOutlined, PrinterOutlined } from '@ant-design/icons';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { ActionDialog, DataTable } from './components';
import BarcodePrintDialog from './BarcodePrintDialog';
import CameraScanDialog from './CameraScanDialog';
import { markPrinted } from './SerialPrintDialog';
import useBarcodeScanner from './useBarcodeScanner';
import { docCode, number, productCode, unitLabel, variantLabel } from './model';

const scannedOf = (i) => Number(i.scanned_quantity || 0);

/** Difference chip: what was scanned compared with the receipt line. */
function Difference({ line }) {
  const d = scannedOf(line) - Number(line.quantity);
  if (d === 0) return <Chip size="small" color="success" variant="outlined" label="Đủ" />;
  return (
    <Chip size="small" color={d < 0 ? 'warning' : 'error'} variant="outlined" label={d < 0 ? `Thiếu ${number(-d)}` : `Thừa ${number(d)}`} />
  );
}

/**
 * Goods check of a receipt waiting for it ("Chờ kiểm hàng"): print labels, stick them on the goods,
 * scan each one. Stock increases only when the check is closed, by what was scanned.
 * A USB/Bluetooth scanner works anywhere on the page; the code box is for typing a code by hand.
 */
export default function ReceiptCheck({ doc, readOnly }) {
  const { owner, reload } = useWarehouse();
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState(null);
  const [overCode, setOverCode] = useState('');
  // null | 'variants' (database chưa có serial: tem mã biến thể như cũ) | danh sách tem serial
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
        const text = `${line.serial_code ? `${line.serial_code} · ` : ''}${variantLabel(line)}: đã quét ${number(line.scanned_quantity)} / ${number(line.quantity)}`;
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

  useBarcodeScanner(scan, !readOnly && !printing && !closing && !camera);

  // Tem serial: mỗi chiếc một mã, chỉ in tem chưa quét (in lại tem hỏng = đúng mã cũ).
  // line = chỉ dòng đó; extra = in thêm 1 tem mới cho dòng đó (hàng giao thừa).
  const openLabels = async (line, extra) => {
    setNotice(null);
    try {
      const body = line ? { itemId: line.receipt_item_id, extra: extra ? 1 : undefined } : undefined;
      const { units } = await api(`/warehouse/documents/${doc.receipt_id}/unit-labels`, { method: 'POST', body });
      if (!units.length) {
        setNotice({ severity: 'info', text: 'Mọi tem của phiếu này đã được quét, không còn tem nào cần in.' });
        return;
      }
      setPrinting((extra ? units.slice(-1) : units).map(unitLabel));
    } catch (e) {
      if (e.status === 503 && !line) setPrinting('variants');
      else setNotice({ severity: 'error', text: e.message });
    }
  };

  // Labels default to the quantity on the receipt; spare labels are fine, only scanned ones count.
  const printable = lines.map((i) => ({
    ...i,
    product_code: productCode(i.product_id),
    unassigned_quantity: i.quantity,
    stock_quantity: i.quantity
  }));

  return (
    <Stack spacing={2}>
      <Alert severity="info">
        <b>In tem → dán lên từng chiếc → quét từng tem.</b> Chỉ chiếc đã quét mới được nhập kho.
      </Alert>
      {!readOnly && (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
          <Button variant="outlined" onClick={() => openLabels()}>
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
            placeholder="Máy quét: quét ở bất kỳ đâu trên trang · hoặc gõ mã tem (ví dụ TH000052-0001) rồi Enter"
            sx={{ flex: 1, minWidth: 240 }}
            slotProps={{ htmlInput: { 'aria-label': 'Mã tem kiểm hàng', maxLength: 64 } }}
          />
          <Button variant="outlined" startIcon={<CameraOutlined />} onClick={() => setCamera(true)} sx={{ whiteSpace: 'nowrap' }}>
            Quét bằng camera
          </Button>
          <Typography variant="h6" sx={{ whiteSpace: 'nowrap' }}>
            Đã quét {number(scanned)} / {number(expected)}
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
            label: 'Đã quét',
            align: 'right',
            render: (i) => (
              <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'flex-end' }}>
                <b>{number(scannedOf(i))}</b>
                {!readOnly && (
                  <Tooltip title="In lại các tem chưa quét của dòng này (tem hỏng, chưa dán)">
                    <span>
                      <IconButton size="small" aria-label={`In lại tem chưa quét ${variantLabel(i)}`} onClick={() => openLabels(i)}>
                        <PrinterOutlined />
                      </IconButton>
                    </span>
                  </Tooltip>
                )}
                {!readOnly && (
                  <Tooltip title="In thêm 1 tem mới cho dòng này (NCC giao dư)">
                    <span>
                      <IconButton size="small" aria-label={`In thêm 1 tem ${variantLabel(i)}`} onClick={() => openLabels(i, true)}>
                        <PlusOutlined />
                      </IconButton>
                    </span>
                  </Tooltip>
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
      {printing === 'variants' && <BarcodePrintDialog variants={printable} onClose={() => setPrinting(null)} />}
      {Array.isArray(printing) && (
        <BarcodePrintDialog serial variants={printing} onClose={() => setPrinting(null)} onPrinted={markPrinted} />
      )}
      {closing && (
        <ActionDialog
          title={`Xác nhận nhập kho ${docCode(doc)}`}
          reason={differences.length > 0}
          text={
            differences.length
              ? `Nhập kho ${number(scanned)} sản phẩm đã quét (trên phiếu ${number(expected)}). Chênh lệch: ${differences
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

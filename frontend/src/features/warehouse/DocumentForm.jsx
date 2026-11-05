import { useState } from 'react';
import { useFormik } from 'formik';
import * as Yup from 'yup';

import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography
} from '@mui/material';

import { CloseOutlined } from '@ant-design/icons';
import { api } from 'services/http';
import { useWarehouse } from './WarehouseContext';
import { Choice, Field } from './components';
import {
  docCode,
  money,
  number,
  returnableQty,
  typeLabel,
  variantLabel,
  when
} from './model';

import ExcelImportDialog from './ExcelImportDialog';
import { downloadImportTemplate } from './excelWorkbook';
import PurchaseOrderForm from './PurchaseOrderForm';

export default function DocumentForm(props) {
  return props.type === 'PURCHASE_ORDER' ? (
    <PurchaseOrderForm document={props.document} onClose={props.onClose} />
  ) : (
    <SourceDocumentForm {...props} />
  );
}

function SourceDocumentForm({
  type,
  document,
  source,
  onClose
}) {
  const { data, documents, run } = useWarehouse();

  const [error, setError] = useState('');
  const [variant, setVariant] = useState('');
  const [excelOpen, setExcelOpen] = useState(false);
  const [excelBusy, setExcelBusy] = useState(false);
  const [importMessage, setImportMessage] = useState('');

  const initialSource =
    document?.source_receipt_id ||
    source?.receipt_id ||
    '';

  const isReturn = type === 'SUPPLIER_RETURN';
  // Returns: received − already dispatched returns (approved but not dispatched returns do not count).
  // Receipts: what is still to receive. From a purchase order line: ordered − received; from a
  // supplier return line (exchange): replacement agreed − replacement already received.
  const exchangeLine = (i) =>
    documents.find((d) => d.receipt_id === i.receipt_id)?.receipt_type === 'SUPPLIER_RETURN';
  const open = (i) =>
    isReturn
      ? returnableQty(i)
      : (exchangeLine(i) ? Number(i.exchanged_quantity) : i.quantity) - i.handled_quantity;

  const sources = documents.filter(
    (d) =>
      (type === 'RECEIPT'
        ? ['PURCHASE_ORDER', 'SUPPLIER_RETURN'].includes(d.receipt_type)
        : d.receipt_type === 'RECEIPT') &&
      d.status === 'CONFIRMED' &&
      ((d.items || []).some((i) => open(i) > 0) ||
        d.receipt_id === Number(initialSource))
  );

  // Only lines of the chosen receipt; a draft keeps its quantities on the lines it already had.
  const returnLines = (id, existing = []) =>
    (
      documents.find(
        (d) => d.receipt_id === Number(id)
      )?.items || []
    )
      .filter(
        (i) =>
          returnableQty(i) > 0 ||
          existing.some((e) => e.source_receipt_item_id === i.receipt_item_id)
      )
      .map((i) => ({
        detailId: i.detail_id,
        sourceItemId: i.receipt_item_id,
        quantity:
          existing.find((e) => e.source_receipt_item_id === i.receipt_item_id)?.quantity ?? 0,
        // Return price comes from the receipt line (receipts have no discount/tax fields).
        unitPrice: i.unit_price
      }));

  const available = (id) =>
    (
      documents.find(
        (d) => d.receipt_id === Number(id)
      )?.items || []
    )
      .filter((i) => open(i) > 0)
      .map((i) => ({
        detailId: i.detail_id,
        sourceItemId: i.receipt_item_id,
        // Receipts start with the outstanding quantity.
        quantity: open(i),
        unitPrice: i.unit_price,
        remaining: open(i)
      }));

  const f = useFormik({
    initialValues: {
      sourceId: initialSource,
      manufacturer: document?.manufacturer_name || '',
      note: document?.note || '',
      items: isReturn
        ? initialSource
          ? returnLines(initialSource, document?.items)
          : []
        : document
        ? document.items.map((i) => ({
            detailId: i.detail_id,
            sourceItemId: i.source_receipt_item_id,
            quantity: i.quantity,
            unitPrice: i.unit_price
          }))
        : initialSource
          ? available(initialSource)
          : []
    },

    validationSchema: Yup.object({
      manufacturer:
        type === 'PURCHASE_ORDER'
          ? Yup.string()
              .trim()
              .required(
                'Nhập tên nhà sản xuất/nhà cung cấp.'
              )
              .max(200)
          : Yup.string(),
      sourceId:
        type !== 'PURCHASE_ORDER'
          ? Yup.number()
              .typeError('Chọn phiếu nguồn.')
              .required('Chọn phiếu nguồn.')
          : Yup.mixed(),
      // The return reason is required before submitting/approving (checked there and in the
      // backend); a draft may be saved without it.
      note: Yup.string().max(255)
    }),

    onSubmit: async (values) => {
      setError('');

      if (
        values.items.some(
          (i) =>
            !Number.isInteger(Number(i.quantity)) ||
            Number(i.quantity) < 0 ||
            Number(i.quantity) > 1000000 ||
            (
              type === 'PURCHASE_ORDER' &&
              Number(i.quantity) === 0
            )
        )
      ) {
        setError(
          'Kiểm tra số lượng từng dòng: phải là số nguyên từ 0 đến 1000000; dòng đặt hàng phải lớn hơn 0.'
        );
        return;
      }

      const over = values.items.find((i) => {
        const line = (sourceDocument?.items || []).find(
          (x) => x.receipt_item_id === i.sourceItemId
        );
        return line && Number(i.quantity) > open(line);
      });

      if (over) {
        setError(
          type === 'RECEIPT'
            ? 'Có dòng nhập vượt lượng còn thiếu. Nhận vượt cần Owner duyệt kèm giá và lý do; schema hiện tại chưa lưu được nên hãy nhập tối đa lượng còn thiếu và ghi nhận phần dư ngoài hệ thống.'
            : 'Có dòng trả vượt số lượng còn được trả.'
        );
        return;
      }

      const items = values.items
        .filter(
          (i) => Number(i.quantity) > 0
        )
        .map((i) => ({
          detailId: i.detailId,
          sourceItemId: i.sourceItemId || null,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice)
        }));

      if (
        !items.length ||
        items.some(
          (i) =>
            !Number.isInteger(i.quantity) ||
            i.quantity > 1000000 ||
            !Number.isInteger(i.unitPrice) ||
            i.unitPrice < 0 ||
            i.unitPrice > 999999999999
        )
      ) {
        setError(
          'Cần ít nhất một dòng có số lượng nguyên dương; đơn giá phải là số nguyên VNĐ hợp lệ.'
        );
        return;
      }

      try {
        await run(
          () =>
            api(
              `/warehouse/documents${
                document
                  ? `/${document.receipt_id}`
                  : ''
              }`,
              {
                method: document ? 'PUT' : 'POST',
                body: {
                  type,
                  sourceId:
                    type === 'PURCHASE_ORDER'
                      ? null
                      : Number(values.sourceId),
                  manufacturer:
                    type === 'PURCHASE_ORDER'
                      ? values.manufacturer.trim()
                      : null,
                  note: values.note.trim(),
                  items
                }
              }
            ),
          'Đã lưu phiếu nháp.'
        );

        onClose();
      } catch (e) {
        setError(e.message);
      }
    }
  });

  const sourceDocument = documents.find(
    (d) => d.receipt_id === Number(f.values.sourceId)
  );

  const canImport =
    type === 'PURCHASE_ORDER' ||
    (
      type === 'RECEIPT' &&
      sourceDocument?.status === 'CONFIRMED' &&
      sourceDocument?.receipt_type === 'PURCHASE_ORDER'
    );

  const total = f.values.items.reduce(
    (n, i) => n + Number(i.quantity || 0),
    0
  );

  return (
    <>
      <Dialog
        open
        onClose={() => !f.isSubmitting && onClose()}
        fullWidth
        maxWidth="lg"
      >
        <Box component="form" onSubmit={f.handleSubmit}>
          <DialogTitle>
            {document
              ? `Sửa ${docCode(document)}`
              : isReturn
                ? 'Tạo phiếu trả'
                : `Tạo ${typeLabel[type].toLowerCase()}`}
          </DialogTitle>

          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <Alert severity="info">
                {type === 'PURCHASE_ORDER'
                  ? 'Mỗi dòng là một màu/size. Xác nhận phiếu đặt chưa làm tăng tồn kho.'
                  : type === 'RECEIPT'
                    ? 'Đã điền sẵn lượng còn thiếu; sửa thành số thực nhận từng màu/size (có thể giao nhiều đợt). Phiếu nháp/chờ duyệt chưa tăng tồn; chỉ khi Owner xác nhận, hàng mới vào tổng tồn ở phần chưa xếp vị trí. Đơn giá giữ theo phiếu đặt. Nhận vượt, nhận thay thế màu/size, đổi giá thực nhập và số từ chối tại cửa chưa lưu được trên schema hiện tại.'
                    : 'Chỉ trả các sản phẩm thuộc phiếu nhập đã chọn. Lưu nháp, gửi duyệt hoặc duyệt phiếu chưa làm giảm tồn kho; tồn chỉ giảm khi xác nhận xuất trả, lúc đó bạn chọn vị trí lấy hàng và số lượng lấy ở từng vị trí.'}
              </Alert>

              {type === 'PURCHASE_ORDER' ? (
                <Field
                  id="manufacturer"
                  label="Nhà sản xuất / nhà cung cấp"
                  name="manufacturer"
                  value={f.values.manufacturer}
                  onChange={f.handleChange}
                  error={
                    f.touched.manufacturer &&
                    Boolean(f.errors.manufacturer)
                  }
                  helperText={
                    f.touched.manufacturer &&
                    f.errors.manufacturer
                  }
                  slotProps={{
                    htmlInput: { maxLength: 200 }
                  }}
                />
              ) : (
                <Choice
                  label={
                    type === 'RECEIPT'
                      ? 'Phiếu nguồn (đơn đặt hàng, hoặc phiếu trả chờ hàng đổi)'
                      : 'Phiếu nhập hàng nguồn'
                  }
                  value={f.values.sourceId}
                  disabled={Boolean(document)}
                  onChange={(e) => {
                    setImportMessage('');
                    f.setFieldValue(
                      'sourceId',
                      e.target.value
                    );
                    f.setFieldValue(
                      'items',
                      isReturn
                        ? returnLines(e.target.value)
                        : available(e.target.value)
                    );
                  }}
                  error={
                    f.touched.sourceId &&
                    Boolean(f.errors.sourceId)
                  }
                  helperText={
                    f.touched.sourceId &&
                    f.errors.sourceId
                  }
                >
                  <MenuItem value="">
                    {isReturn
                      ? 'Chọn phiếu nhập đã xác nhận'
                      : 'Chọn phiếu đã xác nhận'}
                  </MenuItem>

                  {sources.map((d) => (
                    <MenuItem
                      key={d.receipt_id}
                      value={d.receipt_id}
                    >
                      {docCode(d)}
                      {' '}· {d.manufacturer_name}
                    </MenuItem>
                  ))}
                </Choice>
              )}

              {isReturn && sourceDocument && (
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                    gap: 1
                  }}
                >
                  <Typography>
                    Nhà cung cấp: <b>{sourceDocument.manufacturer_name}</b>
                  </Typography>
                  <Typography>
                    Mã phiếu nhập: <b>{docCode(sourceDocument)}</b>
                  </Typography>
                  <Typography>
                    Ngày nhập: <b>{when(sourceDocument.confirmed_at || sourceDocument.receipt_date)}</b>
                  </Typography>
                  <Typography>
                    Kho xuất trả: <b>Kho cửa hàng</b>
                  </Typography>
                </Box>
              )}

              <Field
                id="note"
                label={
                  type === 'SUPPLIER_RETURN'
                    ? 'Lý do trả hàng'
                    : 'Ghi chú'
                }
                name="note"
                value={f.values.note}
                onChange={f.handleChange}
                multiline
                minRows={2}
                error={
                  f.touched.note &&
                  Boolean(f.errors.note)
                }
                helperText={
                  f.touched.note &&
                  f.errors.note
                }
                slotProps={{
                  htmlInput: { maxLength: 255 }
                }}
              />

              {[
                'PURCHASE_ORDER',
                'RECEIPT'
              ].includes(type) && (
                <Box
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2
                  }}
                >
                  <Stack
                    direction={{
                      xs: 'column',
                      sm: 'row'
                    }}
                    spacing={1}
                    sx={{ mb: 1 }}
                  >
                    <Button
                      variant="outlined"
                      disabled={
                        !canImport ||
                        f.isSubmitting ||
                        excelBusy
                      }
                      onClick={() => {
                        setError('');
                        setExcelOpen(true);
                      }}
                    >
                      Nhập từ Excel
                    </Button>

                    <Button
                      disabled={
                        !canImport ||
                        f.isSubmitting ||
                        excelBusy
                      }
                      onClick={async () => {
                        setExcelBusy(true);
                        setError('');

                        try {
                          await downloadImportTemplate({
                            type,
                            variants: data.variants,
                            sourceItems:
                              sourceDocument?.items || [],
                            manufacturer:
                              f.values.manufacturer
                          });
                        } catch (e) {
                          setError(
                            e.message ||
                            'Không tạo được file mẫu Excel.'
                          );
                        } finally {
                          setExcelBusy(false);
                        }
                      }}
                    >
                      {excelBusy
                        ? 'Đang tạo mẫu…'
                        : 'Tải mẫu Excel'}
                    </Button>
                  </Stack>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                  >
                    {type === 'RECEIPT' && !canImport
                      ? 'Chọn phiếu đặt đã xác nhận trước khi tải Excel.'
                      : 'Bạn có thể nhập thủ công, đọc file Excel (.xlsx), rồi sửa tiếp ngay trên phiếu. File chỉ điền dữ liệu, chưa lưu phiếu hoặc tăng tồn.'}
                  </Typography>
                </Box>
              )}

              {importMessage && (
                <Alert
                  severity="success"
                  onClose={() => setImportMessage('')}
                >
                  {importMessage}
                </Alert>
              )}

              {type === 'PURCHASE_ORDER' && (
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'end' }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Choice
                      label="Thêm màu / size"
                      value={variant}
                      onChange={(e) =>
                        setVariant(e.target.value)
                      }
                    >
                      <MenuItem value="">
                        Chọn biến thể sản phẩm
                      </MenuItem>

                      {data.variants
                        .filter(
                          (v) =>
                            !f.values.items.some(
                              (i) =>
                                i.detailId === v.detail_id
                            )
                        )
                        .map((v) => (
                          <MenuItem
                            key={v.detail_id}
                            value={v.detail_id}
                          >
                            {variantLabel(v)}
                          </MenuItem>
                        ))}
                    </Choice>
                  </Box>

                  <Button
                    variant="outlined"
                    disabled={
                      !variant ||
                      f.values.items.length >= 200
                    }
                    onClick={() => {
                      f.setFieldValue(
                        'items',
                        [
                          ...f.values.items,
                          {
                            detailId: Number(variant),
                            quantity: 1,
                            unitPrice: 0
                          }
                        ]
                      );
                      setVariant('');
                    }}
                  >
                    Thêm dòng
                  </Button>
                </Stack>
              )}

              <Box sx={{ overflowX: 'auto' }}>
                <Table size="small">
                  <TableHead>
                    {isReturn ? (
                      <TableRow>
                        <TableCell>Sản phẩm</TableCell>
                        <TableCell>Màu / size</TableCell>
                        <TableCell align="right">Đã nhập</TableCell>
                        <TableCell align="right">Đã trả</TableCell>
                        <TableCell align="right">Còn được trả</TableCell>
                        <TableCell sx={{ minWidth: 120 }}>Số lượng trả</TableCell>
                        <TableCell sx={{ minWidth: 150 }}>Đơn giá trả</TableCell>
                        <TableCell align="right">Thành tiền</TableCell>
                      </TableRow>
                    ) : (
                    <TableRow>
                      <TableCell>
                        Sản phẩm · màu · size
                      </TableCell>

                      {type === 'RECEIPT' && (
                        <TableCell align="right">
                          Còn thiếu
                        </TableCell>
                      )}

                      <TableCell sx={{ minWidth: 120 }}>
                        Số lượng
                      </TableCell>

                      <TableCell sx={{ minWidth: 150 }}>
                        Đơn giá nhập
                      </TableCell>

                      <TableCell align="right">
                        Thành tiền
                      </TableCell>

                      {type === 'PURCHASE_ORDER' && (
                        <TableCell />
                      )}
                    </TableRow>
                    )}
                  </TableHead>

                  <TableBody>
                    {f.values.items.map((item, idx) => {
                      const v = data.variants.find(
                        (x) => x.detail_id === item.detailId
                      );

                      const sourceLine = documents
                        .find(
                          (d) =>
                            d.receipt_id ===
                            Number(f.values.sourceId)
                        )
                        ?.items.find(
                          (i) =>
                            i.receipt_item_id === item.sourceItemId
                        );

                      return (
                        <TableRow key={item.detailId}>
                          {isReturn ? (
                            <>
                              <TableCell>
                                {sourceLine?.product_name || v?.product_name || `Biến thể #${item.detailId}`}
                              </TableCell>
                              <TableCell>
                                {sourceLine?.color || v?.color} / {sourceLine?.size || v?.size}
                              </TableCell>
                              <TableCell align="right">{number(sourceLine?.quantity)}</TableCell>
                              <TableCell align="right">{number(sourceLine?.handled_quantity)}</TableCell>
                              <TableCell align="right">{number(sourceLine ? open(sourceLine) : 0)}</TableCell>
                            </>
                          ) : (
                          <TableCell>
                            {v
                              ? variantLabel(v)
                              : `Biến thể #${item.detailId}`}
                          </TableCell>
                          )}

                          {type === 'RECEIPT' && (
                            <TableCell align="right">
                              {number(
                                sourceLine
                                  ? open(sourceLine)
                                  : item.remaining
                              )}
                            </TableCell>
                          )}

                          <TableCell>
                            <TextField
                              size="small"
                              type="number"
                              value={item.quantity}
                              onChange={(e) =>
                                f.setFieldValue(
                                  `items.${idx}.quantity`,
                                  e.target.value
                                )
                              }
                              slotProps={{
                                htmlInput: {
                                  min:
                                    type === 'PURCHASE_ORDER'
                                      ? 1
                                      : 0,
                                  step: 1,
                                  max: 1000000,
                                  'aria-label':
                                    `Số lượng ${
                                      v
                                        ? variantLabel(v)
                                        : item.detailId
                                    }`
                                }
                              }}
                            />
                            {sourceLine &&
                              Number(item.quantity) > open(sourceLine) && (
                                <Typography variant="caption" color="error" component="div" sx={{ maxWidth: 260 }}>
                                  {type === 'RECEIPT' && exchangeLine(sourceLine)
                                    ? `Vượt số hàng đổi còn chờ nhận (${number(open(sourceLine))}).`
                                    : type === 'RECEIPT'
                                    ? `Nhận vượt: đặt ${number(sourceLine.quantity)} · đã nhập ${number(sourceLine.handled_quantity)} · còn thiếu ${number(sourceLine.quantity - sourceLine.handled_quantity)} · lần này ${number(item.quantity)} · vượt ${number(Number(item.quantity) - (sourceLine.quantity - sourceLine.handled_quantity))}. Chưa ghi nhận được phần vượt (cần bổ sung schema).`
                                    : `Vượt số lượng còn được trả (${number(open(sourceLine))}).`}
                                </Typography>
                              )}
                          </TableCell>

                          <TableCell>
                            <TextField
                              size="small"
                              type="number"
                              value={item.unitPrice}
                              disabled={
                                type !== 'PURCHASE_ORDER'
                              }
                              onChange={(e) =>
                                f.setFieldValue(
                                  `items.${idx}.unitPrice`,
                                  e.target.value
                                )
                              }
                              slotProps={{
                                htmlInput: {
                                  min: 0,
                                  step: 1,
                                  max: 999999999999,
                                  'aria-label': isReturn ? 'Đơn giá trả' : 'Đơn giá nhập'
                                }
                              }}
                            />
                          </TableCell>

                          <TableCell align="right">
                            {money(
                              Number(item.quantity) *
                              Number(item.unitPrice)
                            )}
                          </TableCell>

                          {type === 'PURCHASE_ORDER' && (
                            <TableCell>
                              <IconButton
                                aria-label="Xóa dòng"
                                onClick={() =>
                                  f.setFieldValue(
                                    'items',
                                    f.values.items.filter(
                                      (_, i) => i !== idx
                                    )
                                  )
                                }
                              >
                                <CloseOutlined />
                              </IconButton>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}

                    {!f.values.items.length && (
                      <TableRow>
                        <TableCell
                          colSpan={8}
                          sx={{ py: 3 }}
                        >
                          {isReturn
                            ? 'Chọn phiếu nhập để xem các sản phẩm có thể trả'
                            : 'Chọn phiếu nguồn hoặc thêm màu/size để lập phiếu. Sản phẩm cần có biến thể trong danh mục trước.'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </Box>

              <Stack
                direction="row"
                sx={{ justifyContent: 'space-between' }}
              >
                <Typography variant="h5">
                  Tổng số lượng: {number(total)}
                </Typography>

                <Typography variant="h5">
                  Tổng tiền:{' '}
                  {money(
                    f.values.items.reduce(
                      (n, i) =>
                        n +
                        Number(i.quantity) *
                        Number(i.unitPrice),
                      0
                    )
                  )}
                </Typography>
              </Stack>

              {error && (
                <Alert severity="error">
                  {error}
                </Alert>
              )}
            </Stack>
          </DialogContent>

          <DialogActions>
            <Button
              onClick={onClose}
              disabled={f.isSubmitting || excelBusy}
            >
              Quay lại
            </Button>

            <Button
              type="submit"
              variant="contained"
              disabled={f.isSubmitting || excelBusy}
            >
              {f.isSubmitting
                ? 'Đang lưu…'
                : 'Lưu phiếu nháp'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {excelOpen && canImport && (
        <ExcelImportDialog
          type={type}
          variants={data.variants}
          sourceItems={sourceDocument?.items || []}
          currentItems={f.values.items}
          manufacturer={f.values.manufacturer}
          onClose={() => setExcelOpen(false)}
          onApply={(report) => {
            f.setFieldValue('items', report.items);

            if (
              type === 'PURCHASE_ORDER' &&
              !f.values.manufacturer.trim() &&
              report.importedManufacturer
            ) {
              f.setFieldValue(
                'manufacturer',
                report.importedManufacturer
              );
            }

            setImportMessage(
              `Đã điền ${report.imports.length} biến thể từ Excel. Hãy kiểm tra rồi lưu phiếu nháp.`
            );

            setExcelOpen(false);
          }}
        />
      )}
    </>
  );
}
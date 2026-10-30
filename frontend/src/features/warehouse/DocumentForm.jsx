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
  typeLabel,
  variantLabel
} from './model';

import ExcelImportDialog from './ExcelImportDialog';
import { downloadImportTemplate } from './excelWorkbook';

export default function DocumentForm({
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

  const sources = documents.filter(
    (d) =>
      d.receipt_type ===
        (type === 'RECEIPT'
          ? 'PURCHASE_ORDER'
          : 'RECEIPT') &&
      d.status === 'CONFIRMED'
  );

  const available = (id) =>
    (
      documents.find(
        (d) => d.receipt_id === Number(id)
      )?.items || []
    )
      .filter(
        (i) => i.quantity > i.handled_quantity
      )
      .map((i) => ({
        detailId: i.detail_id,
        sourceItemId: i.receipt_item_id,
        quantity: 0,
        unitPrice: i.unit_price,
        remaining:
          i.quantity - i.handled_quantity
      }));

  const f = useFormik({
    initialValues: {
      sourceId: initialSource,
      manufacturer: document?.manufacturer_name || '',
      note: document?.note || '',
      items: document
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
      note:
        type === 'SUPPLIER_RETURN'
          ? Yup.string()
              .trim()
              .required('Nhập lý do trả hàng.')
              .max(255)
          : Yup.string().max(255)
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
              : `Tạo ${typeLabel[type].toLowerCase()}`}
          </DialogTitle>

          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <Alert severity="info">
                {type === 'PURCHASE_ORDER'
                  ? 'Mỗi dòng là một màu/size. Xác nhận phiếu đặt chưa làm tăng tồn kho.'
                  : type === 'RECEIPT'
                    ? 'Chọn đúng số lượng thực nhận từng màu/size. Chỉ khi Owner xác nhận, hàng mới vào tổng tồn và nằm ở phần chưa xếp vị trí.'
                    : 'Trả theo phiếu nhập đã xác nhận. Khi xác nhận, hệ thống trừ hàng chưa xếp trước, rồi các vị trí theo thứ tự mã vị trí; xem lịch sử kho để đối chiếu.'}
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
                      ? 'Phiếu đặt hàng nguồn'
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
                      available(e.target.value)
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
                    Chọn phiếu đã xác nhận
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
                    <TableRow>
                      <TableCell>
                        Sản phẩm · màu · size
                      </TableCell>

                      {type !== 'PURCHASE_ORDER' && (
                        <TableCell align="right">
                          Còn được nhập/trả
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
                          <TableCell>
                            {v
                              ? variantLabel(v)
                              : `Biến thể #${item.detailId}`}
                          </TableCell>

                          {type !== 'PURCHASE_ORDER' && (
                            <TableCell align="right">
                              {number(
                                sourceLine
                                  ? sourceLine.quantity -
                                    sourceLine.handled_quantity
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
                                  'aria-label': 'Đơn giá nhập'
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
                          colSpan={6}
                          sx={{ py: 3 }}
                        >
                          Chọn phiếu nguồn hoặc thêm màu/size
                          để lập phiếu. Sản phẩm cần có biến thể
                          trong danh mục trước.
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
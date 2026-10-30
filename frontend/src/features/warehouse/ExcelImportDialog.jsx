import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography
} from '@mui/material';

import { Choice } from './components';
import { number, variantLabel } from './model';

import {
  checkImport,
  IMPORT_FIELDS,
  inferMapping,
  mappedValue
} from './excelImport';

import {
  importRows,
  loadImportWorkbook,
  sheetDefaults
} from './excelWorkbook';

export default function ExcelImportDialog({
  type,
  variants,
  sourceItems,
  currentItems,
  manufacturer,
  onApply,
  onClose
}) {
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [header, setHeader] = useState(0);
  const [mapping, setMapping] = useState(inferMapping([]));
  const [rows, setRows] = useState([]);
  const [mergeDuplicates, setMergeDuplicates] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(0);
  const [onlyErrors, setOnlyErrors] = useState(false);

  const sheet = sheets[sheetIndex];

  const report = useMemo(
    () =>
      checkImport(rows, mapping, {
        type,
        variants,
        sourceItems,
        currentItems,
        manufacturer,
        mergeDuplicates
      }),
    [
      rows,
      mapping,
      type,
      variants,
      sourceItems,
      currentItems,
      manufacturer,
      mergeDuplicates
    ]
  );

  const listed = report.rows.filter(
    (r) => !onlyErrors || r.errors.length
  );

  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(listed.length / 20) - 1)
  );

  const selectable =
    type === 'RECEIPT'
      ? variants.filter((v) =>
          sourceItems.some(
            (s) => s.detail_id === v.detail_id
          )
        )
      : variants;

  const updateRow = (rowNumber, patch) =>
    setRows((old) =>
      old.map((r) =>
        r.rowNumber === rowNumber
          ? { ...r, ...patch }
          : r
      )
    );

  const chooseSheet = (index, all = sheets) => {
    setSheetIndex(index);
    setPage(0);
    setError('');
    setMergeDuplicates(false);

    try {
      const defaults = sheetDefaults(all[index]);
      setHeader(defaults.header);
      setMapping(defaults.mapping);
      setRows(defaults.rows);
    } catch (e) {
      setRows([]);
      setError(e.message);
    }
  };

  const changeHeader = (index) => {
    setHeader(index);
    setPage(0);
    setMapping(inferMapping(sheet.rows[index] || []));

    try {
      setRows(importRows(sheet, index));
      setError('');
    } catch (e) {
      setRows([]);
      setError(e.message);
    }
  };

  const fields = IMPORT_FIELDS.filter(
    ([key]) =>
      type === 'PURCHASE_ORDER' ||
      !['unitPrice', 'manufacturer'].includes(key)
  );

  return (
    <Dialog
      open
      fullWidth
      maxWidth="xl"
      aria-label="Nhập dữ liệu từ Excel"
      onClose={() => !loading && onClose()}
    >
      <DialogTitle>Nhập dữ liệu từ Excel</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Alert severity="info">
            {type === 'PURCHASE_ORDER'
              ? 'Đọc sản phẩm, màu/size, số lượng đặt và đơn giá từ file.'
              : 'Đối chiếu hàng thực nhận với phiếu đặt đã chọn. Đơn giá lấy từ phiếu đặt.'}
            {' '}Kiểm tra bảng xem trước rồi áp dụng vào phiếu.
            Tồn kho chưa thay đổi.
          </Alert>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={2}
            sx={{ alignItems: { sm: 'center' } }}
          >
            <Button
              component="label"
              variant="outlined"
              disabled={loading}
            >
              {loading
                ? 'Đang đọc file…'
                : 'Chọn file Excel (.xlsx)'}

              <input
                hidden
                type="file"
                accept=".xlsx"
                aria-label="Chọn file Excel"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';

                  if (!file) return;

                  setLoading(true);
                  setError('');
                  setFileName('');
                  setSheets([]);
                  setRows([]);

                  try {
                    const result = await loadImportWorkbook(file);
                    setSheets(result);
                    setFileName(file.name);
                    chooseSheet(0, result);
                  } catch (failure) {
                    setError(failure.message);
                  } finally {
                    setLoading(false);
                  }
                }}
              />
            </Button>

            <Typography sx={{ overflowWrap: 'anywhere' }}>
              {fileName ||
                'File .xlsx, tối đa 5 MB. Có thể chọn sheet và ghép cột theo file của bạn.'}
            </Typography>
          </Stack>

          {sheets.length > 0 && (
            <>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={2}
              >
                <Choice
                  label="Sheet dữ liệu"
                  value={sheetIndex}
                  onChange={(e) =>
                    chooseSheet(Number(e.target.value))
                  }
                >
                  {sheets.map((s, i) => (
                    <MenuItem key={i} value={i}>
                      {s.name}
                    </MenuItem>
                  ))}
                </Choice>

                {!sheet.error && (
                  <Choice
                    label="Dòng tiêu đề"
                    value={header}
                    onChange={(e) =>
                      changeHeader(Number(e.target.value))
                    }
                  >
                    {sheet.rows.slice(0, 30).map((_, i) => (
                      <MenuItem key={i} value={i}>
                        Dòng {i + 1}
                      </MenuItem>
                    ))}
                  </Choice>
                )}
              </Stack>

              {sheet.error ? (
                <Alert severity="error">
                  {sheet.error}
                </Alert>
              ) : (
                <>
                  <Typography variant="subtitle1">
                    Ghép cột Excel với dữ liệu trên phiếu
                  </Typography>

                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: {
                        xs: '1fr',
                        sm: 'repeat(2,minmax(0,1fr))',
                        lg: 'repeat(4,minmax(0,1fr))'
                      },
                      gap: 2
                    }}
                  >
                    {fields.map(([key, label]) => (
                      <Choice
                        key={key}
                        label={`Cột ${label}`}
                        value={mapping[key]}
                        onChange={(e) => {
                          setMapping((old) => ({
                            ...old,
                            [key]: e.target.value
                          }));

                          try {
                            setRows(importRows(sheet, header));
                            setError('');
                          } catch (failure) {
                            setRows([]);
                            setError(failure.message);
                          }

                          setPage(0);
                        }}
                      >
                        <MenuItem value="">
                          Không dùng cột này
                        </MenuItem>

                        {(sheet.rows[header] || []).map(
                          (title, index) => (
                            <MenuItem
                              key={index}
                              value={String(index)}
                            >
                              {index + 1}. {title || '(trống)'}
                            </MenuItem>
                          )
                        )}
                      </Choice>
                    ))}
                  </Box>

                  <Typography
                    variant="caption"
                    color="text.secondary"
                  >
                    Mã biến thể/mã sản phẩm phải là mã trong THORS.
                    Có thể đối chiếu bằng tên sản phẩm, màu và size.
                    Đổi sheet, dòng tiêu đề hoặc ghép cột sẽ đặt lại
                    các chỉnh sửa ở bảng xem trước.
                  </Typography>

                  {report.issues.map((message) => (
                    <Alert key={message} severity="warning">
                      {message}
                    </Alert>
                  ))}

                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    sx={{
                      gap: 1,
                      alignItems: { sm: 'center' }
                    }}
                  >
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={mergeDuplicates}
                          onChange={(e) =>
                            setMergeDuplicates(e.target.checked)
                          }
                        />
                      }
                      label="Gộp các dòng trùng biến thể bằng cách cộng số lượng"
                    />

                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={onlyErrors}
                          onChange={(e) => {
                            setOnlyErrors(e.target.checked);
                            setPage(0);
                          }}
                        />
                      }
                      label="Chỉ hiện dòng lỗi"
                    />
                  </Stack>

                  <Typography variant="subtitle1">
                    {number(rows.length)} dòng
                    {' '}· {number(report.errorCount)} dòng lỗi
                    {' '}· {number(report.imports.length)} biến thể hợp lệ
                    {' '}· Tổng số lượng {number(report.total)}
                  </Typography>

                  <Box
                    sx={{
                      overflowX: 'auto',
                      maxHeight: 440
                    }}
                  >
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell>Dòng Excel</TableCell>
                          <TableCell>Dữ liệu gốc</TableCell>
                          <TableCell sx={{ minWidth: 240 }}>
                            Biến thể tương ứng
                          </TableCell>
                          <TableCell sx={{ minWidth: 130 }}>
                            Số lượng
                          </TableCell>
                          <TableCell sx={{ minWidth: 140 }}>
                            Đơn giá VNĐ
                          </TableCell>
                          <TableCell sx={{ minWidth: 230 }}>
                            Kiểm tra
                          </TableCell>
                          <TableCell>Bỏ qua</TableCell>
                        </TableRow>
                      </TableHead>

                      <TableBody>
                        {listed
                          .slice(
                            currentPage * 20,
                            currentPage * 20 + 20
                          )
                          .map((row) => (
                            <TableRow
                              key={row.rowNumber}
                              sx={{
                                opacity: row.skipped ? 0.5 : 1
                              }}
                            >
                              <TableCell>
                                {row.rowNumber}
                              </TableCell>

                              <TableCell
                                sx={{
                                  maxWidth: 240,
                                  overflowWrap: 'anywhere'
                                }}
                              >
                                {[
                                  'detailId',
                                  'productId',
                                  'productName',
                                  'color',
                                  'size'
                                ]
                                  .map((key) =>
                                    mappedValue(row, mapping, key)
                                  )
                                  .filter(Boolean)
                                  .join(' · ') ||
                                  '(Không có định danh)'}
                              </TableCell>

                              <TableCell>
                                <Choice
                                  label={`Biến thể dòng ${row.rowNumber}`}
                                  value={row.variant?.detail_id || ''}
                                  disabled={row.skipped}
                                  onChange={(e) =>
                                    updateRow(row.rowNumber, {
                                      detailId: e.target.value
                                    })
                                  }
                                >
                                  <MenuItem value="">
                                    Chọn biến thể
                                  </MenuItem>

                                  {selectable.map((v) => (
                                    <MenuItem
                                      key={v.detail_id}
                                      value={v.detail_id}
                                    >
                                      #{v.detail_id}
                                      {' '}· {variantLabel(v)}
                                    </MenuItem>
                                  ))}
                                </Choice>
                              </TableCell>

                              <TableCell>
                                <TextField
                                  size="small"
                                  disabled={row.skipped}
                                  value={
                                    row.skipped
                                      ? ''
                                      : rows.find(
                                          (r) =>
                                            r.rowNumber === row.rowNumber
                                        )?.quantity ??
                                        mappedValue(
                                          row,
                                          mapping,
                                          'quantity'
                                        )
                                  }
                                  onChange={(e) =>
                                    updateRow(row.rowNumber, {
                                      quantity: e.target.value
                                    })
                                  }
                                  slotProps={{
                                    htmlInput: {
                                      'aria-label':
                                        `Số lượng dòng ${row.rowNumber}`
                                    }
                                  }}
                                />
                              </TableCell>

                              <TableCell>
                                {type === 'PURCHASE_ORDER' ? (
                                  <TextField
                                    size="small"
                                    disabled={row.skipped}
                                    value={
                                      rows.find(
                                        (r) =>
                                          r.rowNumber === row.rowNumber
                                      )?.unitPrice ??
                                      mappedValue(
                                        row,
                                        mapping,
                                        'unitPrice'
                                      )
                                    }
                                    onChange={(e) =>
                                      updateRow(row.rowNumber, {
                                        unitPrice: e.target.value
                                      })
                                    }
                                    slotProps={{
                                      htmlInput: {
                                        'aria-label':
                                          `Đơn giá dòng ${row.rowNumber}`
                                      }
                                    }}
                                  />
                                ) : (
                                  number(row.unitPrice || 0)
                                )}
                              </TableCell>

                              <TableCell>
                                {row.skipped
                                  ? 'Đã bỏ qua'
                                  : row.errors.length
                                    ? row.errors.map((message) => (
                                        <Typography
                                          key={message}
                                          color="error"
                                          variant="caption"
                                          component="div"
                                        >
                                          {message}
                                        </Typography>
                                      ))
                                    : row.source
                                      ? `Hợp lệ · còn được nhập ${number(
                                          row.source.quantity -
                                          row.source.handled_quantity
                                        )}`
                                      : 'Hợp lệ'}
                              </TableCell>

                              <TableCell>
                                <Checkbox
                                  checked={Boolean(row.skip)}
                                  onChange={(e) =>
                                    updateRow(row.rowNumber, {
                                      skip: e.target.checked
                                    })
                                  }
                                  slotProps={{
                                    input: {
                                      'aria-label':
                                        `Bỏ qua dòng ${row.rowNumber}`
                                    }
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </Box>

                  <TablePagination
                    component="div"
                    count={listed.length}
                    page={currentPage}
                    onPageChange={(_, next) => setPage(next)}
                    rowsPerPage={20}
                    rowsPerPageOptions={[20]}
                    labelDisplayedRows={({ from, to, count }) =>
                      `${from}–${to} / ${count}`
                    }
                  />

                  <Alert severity="info">
                    Các dòng có trong file sẽ điền lại số lượng/đơn giá
                    trên phiếu; các dòng khác đang nhập tay được giữ lại.
                    {report.replaced > 0
                      ? ` Có ${report.replaced} dòng đang có số lượng sẽ được điền lại.`
                      : ''}
                    {' '}Bạn vẫn sửa được sau khi áp dụng.
                  </Alert>
                </>
              )}
            </>
          )}

          {error && (
            <Alert severity="error">{error}</Alert>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Quay lại phiếu
        </Button>

        <Button
          variant="contained"
          disabled={
            loading ||
            !sheet ||
            Boolean(sheet.error) ||
            !report.valid
          }
          onClick={() => onApply(report)}
        >
          Áp dụng vào phiếu
        </Button>
      </DialogActions>
    </Dialog>
  );
}
import {
  MAX_FILE_BYTES,
  MAX_IMPORT_ROWS,
  guessHeader,
  inferMapping
} from './excelImport.js';

let library;

async function excel() {
  if (!library) {
    library = import('exceljs/dist/exceljs.min.js')
      .then((m) => m.default || m);
  }

  return library;
}

function value(cell) {
  const v = cell.value;

  if (v == null) return '';

  if (
    typeof v === 'string' ||
    typeof v === 'number'
  ) {
    return String(v);
  }

  if (v.formula || v.sharedFormula) {
    return '[Công thức: hãy nhập giá trị]';
  }

  if (v.richText) {
    return v.richText.map((t) => t.text).join('');
  }

  if (v.text != null) return String(v.text);
  if (v.error) return `[Lỗi Excel: ${v.error}]`;

  return '[Kiểu dữ liệu không hỗ trợ]';
}

export async function loadImportWorkbook(file) {
  if (!/\.xlsx$/i.test(file.name)) {
    throw new Error(
      'Chọn file .xlsx. Với file .xls cũ, hãy mở bằng Excel và lưu lại thành .xlsx.'
    );
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error('File Excel tối đa 5 MB.');
  }

  const Excel = await excel();
  const book = new Excel.Workbook();

  try {
    await book.xlsx.load(
      await file.arrayBuffer(),
      {
        ignoreNodes: ['picture', 'drawing', 'extLst']
      }
    );
  } catch {
    throw new Error(
      'Không đọc được file. Hãy kiểm tra file .xlsx có hợp lệ, không bị hỏng hoặc đặt mật khẩu.'
    );
  }

  const sheets = book.worksheets
    .filter((s) => s.actualRowCount > 0)
    .map((s) => {
      if (
        s.rowCount > MAX_IMPORT_ROWS + 30 ||
        s.columnCount > 80
      ) {
        return {
          name: s.name,
          error:
            `Sheet có quá nhiều dữ liệu. Tối đa ${MAX_IMPORT_ROWS} dòng dữ liệu và 80 cột.`
        };
      }

      const rows = Array.from(
        { length: s.rowCount },
        (_, i) =>
          Array.from(
            { length: s.columnCount },
            (_, j) =>
              value(s.getCell(i + 1, j + 1))
          )
      );

      return { name: s.name, rows };
    });

  if (!sheets.length) {
    throw new Error('File Excel không có bảng dữ liệu.');
  }

  return sheets;
}

export function importRows(sheet, headerIndex) {
  if (!sheet || sheet.error) {
    throw new Error(
      sheet?.error || 'Chọn sheet dữ liệu.'
    );
  }

  const rows = sheet.rows
    .slice(headerIndex + 1)
    .map((cells, index) => ({
      rowNumber: headerIndex + index + 2,
      cells
    }))
    .filter((row) =>
      row.cells.some((cell) => String(cell).trim())
    );

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new Error(
      `Chỉ đọc tối đa ${MAX_IMPORT_ROWS} dòng dữ liệu mỗi lần.`
    );
  }

  return rows;
}

export function sheetDefaults(sheet) {
  if (!sheet || sheet.error) {
    return {
      header: 0,
      mapping: inferMapping([]),
      rows: []
    };
  }

  const header = guessHeader(sheet.rows);

  return {
    header,
    mapping: inferMapping(sheet.rows[header] || []),
    rows: importRows(sheet, header)
  };
}

export async function downloadImportTemplate({
  type,
  variants,
  sourceItems = [],
  manufacturer = ''
}) {
  const Excel = await excel();
  const book = new Excel.Workbook();
  book.creator = 'THORS';

  const sheet = book.addWorksheet('DuLieu');

  sheet.columns = [
    {
      header: 'Mã biến thể',
      key: 'detail',
      width: 16
    },
    {
      header: 'Mã sản phẩm',
      key: 'product',
      width: 17
    },
    {
      header: 'Tên sản phẩm',
      key: 'name',
      width: 32
    },
    {
      header: 'Màu',
      key: 'color',
      width: 18
    },
    {
      header: 'Size',
      key: 'size',
      width: 12
    },
    {
      header:
        type === 'PURCHASE_ORDER'
          ? 'Số lượng đặt'
          : 'Số lượng thực nhận',
      key: 'qty',
      width: 22
    },
    ...(type === 'PURCHASE_ORDER'
      ? [
          {
            header: 'Đơn giá',
            key: 'price',
            width: 20
          },
          {
            header: 'Nhà cung cấp',
            key: 'supplier',
            width: 28
          }
        ]
      : [])
  ];

  sheet.views = [
    { state: 'frozen', ySplit: 1 }
  ];

  const catalog = book.addWorksheet('DanhMuc');

  catalog.columns = [
    {
      header: 'Mã biến thể',
      key: 'detail',
      width: 16
    },
    {
      header: 'Mã sản phẩm',
      key: 'product',
      width: 17
    },
    {
      header: 'Tên sản phẩm',
      key: 'name',
      width: 32
    },
    {
      header: 'Màu',
      key: 'color',
      width: 18
    },
    {
      header: 'Size',
      key: 'size',
      width: 12
    },
    ...(type === 'RECEIPT'
      ? [
          {
            header: 'Còn được nhập',
            key: 'remaining',
            width: 20
          },
          {
            header: 'Đơn giá nguồn',
            key: 'sourcePrice',
            width: 20
          }
        ]
      : [])
  ];

  catalog.views = [
    { state: 'frozen', ySplit: 1 }
  ];

  for (const v of variants) {
    const source = sourceItems.find(
      (i) => i.detail_id === v.detail_id
    );

    if (
      type === 'RECEIPT' &&
      (
        !source ||
        source.quantity <= source.handled_quantity
      )
    ) {
      continue;
    }

    catalog.addRow({
      detail: String(v.detail_id),
      product: String(v.product_id),
      name: v.product_name,
      color: v.color,
      size: v.size,
      ...(source
        ? {
            remaining:
              source.quantity -
              source.handled_quantity,
            sourcePrice: Number(source.unit_price)
          }
        : {})
    });
  }

  for (const s of [sheet, catalog]) {
    s.getRow(1).font = {
      bold: true,
      color: { argb: 'FFFFFFFF' }
    };

    s.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1677FF' }
    };

    s.getRow(1).height = 26;

    s.autoFilter = {
      from: 'A1',
      to: {
        row: Math.max(1, s.rowCount),
        column: s.columnCount
      }
    };
  }

  const help = book.addWorksheet('HuongDan');

  const instructions = [
    [
      'Nội dung',
      type === 'PURCHASE_ORDER'
        ? 'Tạo phiếu đặt hàng'
        : 'Tạo phiếu nhập từ phiếu đặt đã chọn'
    ],
    [
      'Cách điền',
      'Chép các biến thể cần dùng từ DanhMuc vào DuLieu, rồi điền số lượng. Mỗi dòng là một màu/size.'
    ],
    [
      'Định danh',
      'Mã biến thể và mã sản phẩm là mã trong THORS. Không đổi mã theo mã riêng của nhà cung cấp.'
    ],
    [
      'Số lượng',
      'Số nguyên dương. Tối đa 1000000 mỗi biến thể.'
    ],
    [
      'Đơn giá',
      type === 'PURCHASE_ORDER'
        ? 'Điền đơn giá VNĐ nguyên, từ 0. Không dùng dấu phân cách hàng nghìn hoặc công thức.'
        : 'Ứng dụng lấy đơn giá từ phiếu đặt. Không cần nhập đơn giá trong DuLieu.'
    ],
    [
      'Nhà cung cấp',
      type === 'PURCHASE_ORDER'
        ? manufacturer ||
          'Điền một nhà cung cấp cho phiếu, trong form hoặc cột Nhà cung cấp.'
        : 'Lấy theo phiếu đặt nguồn.'
    ],
    [
      'Kiểm tra',
      'Tải file lên, xem trước và sửa dòng lỗi. Áp dụng vào phiếu chưa lưu DB và chưa tăng tồn.'
    ],
    [
      'Giới hạn',
      `Tối đa ${MAX_IMPORT_ROWS} dòng file, ${200} biến thể mỗi phiếu. File .xlsx tối đa 5 MB.`
    ]
  ];

  help.columns = [
    { width: 22 },
    { width: 105 }
  ];

  instructions.forEach((r) => {
    const row = help.addRow(r);
    row.alignment = {
      vertical: 'top',
      wrapText: true
    };
    row.height = 42;
  });

  help.getColumn(1).font = { bold: true };

  const blob = new Blob(
    [await book.xlsx.writeBuffer()],
    {
      type:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download =
    type === 'PURCHASE_ORDER'
      ? 'THORS_Mau_Dat_Hang.xlsx'
      : 'THORS_Mau_Nhap_Hang.xlsx';

  anchor.click();

  setTimeout(
    () => URL.revokeObjectURL(url),
    1000
  );
}
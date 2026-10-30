export const MAX_IMPORT_ROWS = 2000;
export const MAX_DOCUMENT_LINES = 200;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

export const IMPORT_FIELDS = [
  ['detailId', 'Mã biến thể'],
  ['productId', 'Mã sản phẩm trong hệ thống'],
  ['productName', 'Tên sản phẩm'],
  ['color', 'Màu'],
  ['size', 'Size'],
  ['quantity', 'Số lượng'],
  ['unitPrice', 'Đơn giá'],
  ['manufacturer', 'Nhà sản xuất / nhà cung cấp']
];

const aliases = {
  detailId: [
    'ma bien the',
    'detail id',
    'detail_id',
    'variant id',
    'variant_id'
  ],
  productId: ['ma san pham', 'product id', 'product_id'],
  productName: [
    'ten san pham',
    'ten hang',
    'san pham',
    'product name',
    'product'
  ],
  color: ['mau', 'mau sac', 'color', 'colour'],
  size: ['size', 'kich co', 'kich thuoc'],
  quantity: [
    'so luong',
    'so luong dat',
    'so luong thuc nhan',
    'sl',
    'sl giao',
    'sl nhap',
    'quantity',
    'qty'
  ],
  unitPrice: [
    'don gia',
    'don gia nhap',
    'gia nhap',
    'unit price',
    'unit_price'
  ],
  manufacturer: [
    'nha cung cap',
    'nha san xuat',
    'nha san xuat nha cung cap',
    'ncc',
    'supplier',
    'manufacturer'
  ]
};

export const matchText = (v) =>
  String(v ?? '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('vi');

const headerText = (v) =>
  matchText(v)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export function inferMapping(header) {
  return Object.fromEntries(
    IMPORT_FIELDS.map(([key]) => {
      const index = header.findIndex((h) =>
        aliases[key].some((a) => headerText(a) === headerText(h))
      );

      return [key, index < 0 ? '' : String(index)];
    })
  );
}

export function guessHeader(rows) {
  let best = 0;
  let score = -1;

  rows.slice(0, 30).forEach((row, i) => {
    const map = inferMapping(row);
    const next =
      Object.values(map).filter((v) => v !== '').length +
      (map.quantity !== '' ? 4 : 0);

    if (next > score) {
      best = i;
      score = next;
    }
  });

  return best;
}

function integer(value, label, minimum, maximum) {
  const text = String(value ?? '').trim();

  if (!/^\d+$/.test(text)) {
    throw new Error(
      `${label} phải là số nguyên, không có dấu phân cách.`
    );
  }

  const number = Number(text);

  if (
    !Number.isSafeInteger(number) ||
    number < minimum ||
    number > maximum
  ) {
    throw new Error(
      `${label} phải từ ${minimum} đến ${maximum}.`
    );
  }

  return number;
}

const read = (row, mapping, key) =>
  mapping[key] === '' || mapping[key] == null
    ? ''
    : row.cells[Number(mapping[key])] ?? '';

export function checkImport(
  rows,
  mapping,
  {
    type,
    variants,
    sourceItems = [],
    currentItems = [],
    manufacturer = '',
    mergeDuplicates = false
  }
) {
  const issues = [];
  const selected = rows.filter((r) => !r.skip);

  const mapped = Object.entries(mapping).filter(
    ([key, column]) =>
      column !== '' &&
      !(
        type !== 'PURCHASE_ORDER' &&
        ['unitPrice', 'manufacturer'].includes(key)
      )
  );

  if (
    new Set(mapped.map(([, column]) => column)).size !== mapped.length
  ) {
    issues.push(
      'Mỗi cột Excel chỉ ghép với một trường dữ liệu. Hãy kiểm tra lại phần ghép cột.'
    );
  }

  if (mapping.quantity === '') {
    issues.push('Chọn cột Số lượng.');
  }

  if (
    mapping.detailId === '' &&
    mapping.productId === '' &&
    mapping.productName === ''
  ) {
    issues.push(
      'Chọn cột mã biến thể, mã sản phẩm hoặc tên sản phẩm.'
    );
  }

  if (!selected.length) {
    issues.push('Chưa có dòng nào được chọn.');
  }

  const inspected = rows.map((row) => {
    if (row.skip) {
      return { ...row, errors: [], skipped: true };
    }

    const errors = [];
    let variant;
    let quantity;
    let unitPrice;

    const manualVariant =
      row.detailId != null && row.detailId !== '';

    if (manualVariant) {
      variant = variants.find(
        (v) => v.detail_id === Number(row.detailId)
      );
    } else {
      let found = variants;

      const id = read(row, mapping, 'detailId');
      const product = read(row, mapping, 'productId');
      const name = read(row, mapping, 'productName');
      const color = read(row, mapping, 'color');
      const size = read(row, mapping, 'size');

      if (String(id).trim()) {
        found = found.filter(
          (v) =>
            /^\d+$/.test(String(id).trim()) &&
            v.detail_id === Number(id)
        );
      } else if (String(product).trim()) {
        found = found.filter(
          (v) =>
            /^\d+$/.test(String(product).trim()) &&
            v.product_id === Number(product)
        );
      } else if (String(name).trim()) {
        found = found.filter(
          (v) => matchText(v.product_name) === matchText(name)
        );
      } else {
        found = [];
      }

      if (String(product).trim()) {
        found = found.filter(
          (v) =>
            /^\d+$/.test(String(product).trim()) &&
            v.product_id === Number(product)
        );
      }

      if (String(name).trim()) {
        found = found.filter(
          (v) => matchText(v.product_name) === matchText(name)
        );
      }

      if (String(color).trim()) {
        found = found.filter(
          (v) => matchText(v.color) === matchText(color)
        );
      }

      if (String(size).trim()) {
        found = found.filter(
          (v) => matchText(v.size) === matchText(size)
        );
      }

      if (found.length === 1) {
        variant = found[0];
      } else {
        errors.push(
          found.length > 1
            ? 'Có nhiều biến thể phù hợp. Hãy chọn đúng màu/size.'
            : 'Không khớp sản phẩm, màu hoặc size. Hãy chọn lại biến thể.'
        );
      }
    }

    if (manualVariant && !variant) {
      errors.push('Biến thể được chọn không còn tồn tại.');
    }

    try {
      quantity = integer(
        row.quantity ?? read(row, mapping, 'quantity'),
        'Số lượng',
        1,
        1000000
      );
    } catch (e) {
      errors.push(e.message);
    }

    let source;

    if (type === 'PURCHASE_ORDER') {
      try {
        unitPrice = integer(
          row.unitPrice ?? read(row, mapping, 'unitPrice'),
          'Đơn giá VNĐ',
          0,
          999999999999
        );
      } catch (e) {
        errors.push(e.message);
      }
    } else if (variant) {
      source = sourceItems.find(
        (i) => i.detail_id === variant.detail_id
      );

      if (!source) {
        errors.push('Biến thể không thuộc phiếu đặt đã chọn.');
      } else {
        unitPrice = Number(source.unit_price);

        if (
          quantity >
          source.quantity - source.handled_quantity
        ) {
          errors.push(
            'Số lượng vượt phần còn được nhập của phiếu đặt.'
          );
        }
      }
    }

    return {
      ...row,
      variant,
      quantity,
      unitPrice,
      source,
      errors,
      supplier: String(
        read(row, mapping, 'manufacturer')
      ).trim()
    };
  });

  const groups = new Map();

  for (const row of inspected) {
    if (row.skipped || row.errors.length) continue;

    const key = row.variant.detail_id;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let duplicateGroups = 0;

  for (const group of groups.values()) {
    if (group.length < 2) continue;

    duplicateGroups++;

    if (!mergeDuplicates) {
      group.forEach((r) =>
        r.errors.push(
          'Trùng biến thể. Bật gộp dòng trùng hoặc bỏ các dòng thừa.'
        )
      );
    }

    if (new Set(group.map((r) => r.unitPrice)).size > 1) {
      group.forEach((r) =>
        r.errors.push(
          'Các dòng cùng biến thể có đơn giá khác nhau. Hãy thống nhất đơn giá.'
        )
      );
    }

    const total = group.reduce(
      (n, r) => n + r.quantity,
      0
    );

    if (
      total > 1000000 ||
      (
        group[0].source &&
        total >
          group[0].source.quantity -
          group[0].source.handled_quantity
      )
    ) {
      group.forEach((r) =>
        r.errors.push(
          'Tổng số lượng sau gộp vượt giới hạn được nhập.'
        )
      );
    }
  }

  const suppliers = [
    ...new Set(
      inspected
        .filter((r) => !r.skipped && r.supplier)
        .map((r) => matchText(r.supplier))
    )
  ];

  if (
    type === 'PURCHASE_ORDER' &&
    suppliers.length > 1
  ) {
    issues.push(
      'Một phiếu đặt chỉ thuộc một nhà cung cấp. Hãy tách dữ liệu theo nhà cung cấp.'
    );
  }

  const importedManufacturer =
    inspected.find((r) => !r.skipped && r.supplier)?.supplier || '';

  if (
    type === 'PURCHASE_ORDER' &&
    importedManufacturer &&
    manufacturer.trim() &&
    matchText(importedManufacturer) !== matchText(manufacturer)
  ) {
    issues.push(
      'Nhà cung cấp trong file khác nhà cung cấp trên phiếu. Hãy kiểm tra lại.'
    );
  }

  const imports = [];

  for (const group of groups.values()) {
    if (group.some((r) => r.errors.length)) continue;

    const first = group[0];

    imports.push({
      detailId: first.variant.detail_id,
      quantity: group.reduce(
        (n, r) => n + r.quantity,
        0
      ),
      unitPrice: first.unitPrice,
      ...(first.source
        ? {
            sourceItemId: first.source.receipt_item_id,
            remaining:
              first.source.quantity -
              first.source.handled_quantity
          }
        : {})
    });
  }

  const updates = new Map(
    imports.map((i) => [i.detailId, i])
  );

  const items = currentItems.map(
    (i) => updates.get(i.detailId) || i
  );

  for (const i of imports) {
    if (!currentItems.some(
      (old) => old.detailId === i.detailId
    )) {
      items.push(i);
    }
  }

  if (items.length > MAX_DOCUMENT_LINES) {
    issues.push(
      `Một phiếu hiện hỗ trợ tối đa ${MAX_DOCUMENT_LINES} biến thể. Hãy tách thành nhiều phiếu.`
    );
  }

  if (!imports.length) {
    issues.push('Chưa có dòng hợp lệ để đưa vào phiếu.');
  }

  const errorRows = inspected.filter(
    (r) => !r.skipped && r.errors.length
  );

  return {
    rows: inspected,
    issues,
    duplicateGroups,
    items,
    imports,
    importedManufacturer,
    replaced: imports.filter((i) =>
      currentItems.some(
        (old) =>
          old.detailId === i.detailId &&
          Number(old.quantity) > 0
      )
    ).length,
    total: imports.reduce(
      (n, r) => n + r.quantity,
      0
    ),
    errorCount: errorRows.length,
    valid:
      issues.length === 0 &&
      errorRows.length === 0
  };
}

export const mappedValue = read;
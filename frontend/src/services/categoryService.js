import { api, post } from './http';

// Đối tượng khách hàng chuẩn của danh mục (dùng cho bộ lọc Nam / Nữ / Trẻ em ở cửa hàng).
// Ngoài 4 mã này người dùng có thể gõ tự do (vd "Bé gái") — lưu nguyên chữ đã gõ.
export const TARGET_GROUPS = [
  { value: 'MEN', label: 'Nam' },
  { value: 'WOMEN', label: 'Nữ' },
  { value: 'KIDS', label: 'Trẻ em' },
  { value: 'UNISEX', label: 'Nam & Nữ' }
];

export const isStandardTarget = (value) => TARGET_GROUPS.some((item) => item.value === value);

// Mã chuẩn -> nhãn tiếng Việt; đối tượng tự nhập -> giữ nguyên chữ
export const targetGroupLabel = (value) => TARGET_GROUPS.find((item) => item.value === value)?.label || value || '';

// Tên đầy đủ của danh mục: "Giày › Giày nữ › Cao gót".
// pathName có sẵn khi danh sách đã qua sortCategoriesAsTree; nếu không thì chỉ ghép được với danh mục cha trực tiếp.
export const categoryFullName = (category) =>
  category?.pathName ||
  (category?.parentName ? `${category.parentName} › ${category.categoryName}` : category?.categoryName || '');

// Danh mục được gắn sản phẩm: đang hoạt động và không phải danh mục cha (đang có danh mục con)
export const isAssignableCategory = (category) => category?.status === 'ACTIVE' && !(category?.childCount > 0);

// Sắp xếp theo cây (không giới hạn cấp): mỗi danh mục nằm ngay dưới danh mục cha.
// Kết quả có thêm depth (0 = gốc) và pathName ("Giày › Giày nữ › Cao gót") cho các ô chọn danh mục.
export const sortCategoriesAsTree = (list = []) => {
  const byName = (a, b) => (a.categoryName || '').localeCompare(b.categoryName || '', 'vi');
  const ids = new Set(list.map((c) => c.categoryId));
  const childrenOf = new Map();
  for (const c of list) {
    if (!c.parentId || !ids.has(c.parentId)) continue;
    if (!childrenOf.has(c.parentId)) childrenOf.set(c.parentId, []);
    childrenOf.get(c.parentId).push(c);
  }
  const result = [];
  const seen = new Set();
  const visit = (category, depth, parentPath) => {
    if (seen.has(category.categoryId)) return; // phòng dữ liệu lỗi có vòng lặp
    seen.add(category.categoryId);
    const pathName = parentPath ? `${parentPath} › ${category.categoryName}` : category.categoryName;
    result.push({ ...category, depth, pathName });
    (childrenOf.get(category.categoryId) || []).sort(byName).forEach((child) => visit(child, depth + 1, pathName));
  };
  list.filter((c) => !c.parentId || !ids.has(c.parentId)).sort(byName).forEach((root) => visit(root, 0, ''));
  return result;
};

// id các danh mục con, cháu… của một danh mục (không gồm chính nó)
export const descendantIds = (list = [], categoryId) => {
  const result = new Set();
  const stack = [Number(categoryId)];
  while (stack.length) {
    const current = stack.pop();
    for (const c of list) {
      if (c.parentId === current && !result.has(c.categoryId)) {
        result.add(c.categoryId);
        stack.push(c.categoryId);
      }
    }
  }
  return result;
};

// View Category List
export const getCategories = () => {
  return api('/categories');
};

const categoryBody = (data) => ({
  categoryName: data.categoryName,
  description: data.description,
  parentId: data.parentId ? Number(data.parentId) : null,
  targetGroup: data.targetGroup || null,
  // Khóa icon chọn ở bảng icon ('' = icon mặc định)
  icon: data.icon || null
});

// Add Category
export const createCategory = (data) => {
  return post('/categories', categoryBody(data));
};

// Update Category
export const updateCategory = (categoryId, data) => {
  return api(`/categories/${categoryId}`, {
    method: 'PUT',
    body: categoryBody(data)
  });
};

//status category
export const changeCategoryStatus = (categoryId, status) => {
  return api(`/categories/${categoryId}/status`, {
    method: 'PATCH',
    body: { status }
  });
};

import { api, post } from './http';

// Đối tượng khách hàng của danh mục (dùng cho bộ lọc Nam / Nữ / Trẻ em ở cửa hàng)
export const TARGET_GROUPS = [
  { value: 'MEN', label: 'Nam' },
  { value: 'WOMEN', label: 'Nữ' },
  { value: 'KIDS', label: 'Trẻ em' },
  { value: 'UNISEX', label: 'Nam & Nữ' }
];

export const targetGroupLabel = (value) => TARGET_GROUPS.find((item) => item.value === value)?.label || '';

// Tên đầy đủ của danh mục: "Giày › Giày nam" (danh mục gốc giữ nguyên tên)
export const categoryFullName = (category) =>
  category?.parentName ? `${category.parentName} › ${category.categoryName}` : category?.categoryName || '';

// Danh mục được gắn sản phẩm: đang hoạt động và không phải danh mục cha (đang có danh mục con)
export const isAssignableCategory = (category) => category?.status === 'ACTIVE' && !(category?.childCount > 0);

// Sắp xếp để danh mục con nằm ngay dưới danh mục cha (dùng cho các ô chọn danh mục)
export const sortCategoriesAsTree = (list = []) => {
  const byName = (a, b) => (a.categoryName || '').localeCompare(b.categoryName || '', 'vi');
  const ids = new Set(list.map((c) => c.categoryId));
  const roots = list.filter((c) => !c.parentId || !ids.has(c.parentId)).sort(byName);
  return roots.flatMap((root) => [root, ...list.filter((c) => c.parentId === root.categoryId).sort(byName)]);
};

// View Category List
export const getCategories = () => {
  return api('/categories');
};

const categoryBody = (data) => ({
  categoryName: data.categoryName,
  description: data.description,
  parentId: data.parentId ? Number(data.parentId) : null,
  targetGroup: data.targetGroup || null
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

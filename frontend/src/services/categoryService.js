
import { api, post } from './http';

// View Category List
export const getCategories = () => {
  return api('/categories');
};

// Add Category
export const createCategory = (data) => {
  return post('/categories', {
    categoryName: data.categoryName,
    description: data.description
  });
};

// Update Category
export const updateCategory = (categoryId, data) => {
  return api(`/categories/${categoryId}`, {
    method: 'PUT',
    body: {
      categoryName: data.categoryName,
      description: data.description
    }
  });
};

//status category
export const changeCategoryStatus = (categoryId, status) => {
  return api(`/categories/${categoryId}/status`, {
    method: 'PATCH',
    body: { status }
  });
};


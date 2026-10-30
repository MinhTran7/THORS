
import { api, post } from './http';

export async function getProducts() {
  return api('/products');
}

export async function createProductsBatch(products) {
  return post('/products/batch', { products });
}

export async function createProduct(productData) {
  return api('/products', {
    method: 'POST',
    body: productData
  });
}

export async function createProductWithImages(productData, images) {
  const formData = new FormData();

  formData.append(
    'product',
    new Blob([JSON.stringify(productData)], {
      type: 'application/json'
    })
  );

  images.forEach((file) => {
    formData.append('images', file);
  });

  // Get CSRF token using the existing session
  const csrfResponse = await fetch('/api/auth/csrf', {
    credentials: 'same-origin'
  });

  if (!csrfResponse.ok) {
    throw new Error('Unable to obtain CSRF token.');
  }

  const csrf = await csrfResponse.json();

  const headerName = csrf.headerName;
  const token = csrf.token;

  if (!headerName || !token) {
    throw new Error('Invalid CSRF response.');
  }

  const response = await fetch('/api/products', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      [headerName]: token
    },
    body: formData
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => null);

    throw new Error(
      errorData?.message ||
      errorData?.error ||
      `Unable to create product (HTTP ${response.status}).`
    );
  }

  return response.json();
}

export async function getProductById(productId) {
  return api(`/products/${productId}`);
}

export function getProductStatistics() {
  return api('/products/statistics');
}



export async function updateProduct(productId, productData) {
  // Step 1: Get CSRF token from current session
  const csrfResponse = await fetch('/api/auth/csrf', {
    credentials: 'same-origin'
  });

  if (!csrfResponse.ok) {
    throw new Error(
      `Unable to obtain CSRF token (HTTP ${csrfResponse.status}).`
    );
  }

  const csrf = await csrfResponse.json();

  const headerName = csrf.headerName;
  const token = csrf.token;

  if (!headerName || !token) {
    throw new Error('Invalid CSRF response.');
  }

  // Step 2: Send update request with CSRF token
  const response = await fetch(
    `/api/products/${productId}`,
    {
      method: 'PUT',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [headerName]: token
      },
      body: JSON.stringify(productData)
    }
  );

  // Step 3: Handle response
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message ||
      result?.error ||
      `Unable to update product (HTTP ${response.status}).`
    );
  }

  return result;
}

export async function changeProductStatus(productId, status) {
  // 1. Validate input
  if (!['ACTIVE', 'INACTIVE'].includes(status)) {
    throw new Error('Invalid product status.');
  }

  // 2. Get CSRF token
  const csrfResponse = await fetch('/api/auth/csrf', {
    credentials: 'same-origin'
  });

  if (!csrfResponse.ok) {
    throw new Error(
      `Unable to obtain CSRF token (HTTP ${csrfResponse.status}).`
    );
  }

  const csrf = await csrfResponse.json();

  if (!csrf.headerName || !csrf.token) {
    throw new Error('Invalid CSRF response.');
  }

  // 3. Call Backend API
  const response = await fetch(
    `/api/products/${productId}/status`,
    {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        [csrf.headerName]: csrf.token
      },
      body: JSON.stringify({ status })
    }
  );

  // 4. Read response
  const result = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      result?.message ||
      result?.error ||
      `Unable to change product status (HTTP ${response.status}).`
    );
  }

  return result;
}

export async function deleteProduct(productId) {
  if (!productId || productId <= 0) {
    throw new Error('ID sản phẩm không hợp lệ.');
  }

  return api(`/products/${productId}`, {
    method: 'DELETE'
  });
}

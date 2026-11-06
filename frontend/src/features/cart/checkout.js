// Hàm điều hướng sang trang đặt hàng. Dùng ở trang giỏ hàng và trang chi tiết sản phẩm.

// Phải trùng với STORAGE_KEY trong CheckoutPage.jsx
export const CHECKOUT_STORAGE_KEY = 'thors:checkout';

// Mua các dòng đã chọn trong giỏ hàng
export function checkoutFromCart(navigate, itemIds) {
  navigate('/checkout', { state: { itemIds } });
}

// Mua ngay 1 sản phẩm (không qua giỏ hàng)
export function buyNow(navigate, { variantId, productName, imageUrl, size, color, unitPrice, quantity = 1 }) {
  navigate('/checkout', {
    state: { buyNow: { variantId, productName, imageUrl, size, color, unitPrice, quantity } }
  });
}

// Khách chưa đăng nhập bấm "Mua ngay": nhớ sản phẩm lại để sau khi đăng nhập
// trang /checkout tự đọc và hiển thị đúng sản phẩm này.
export function stashBuyNow({ variantId, productName, imageUrl, size, color, unitPrice, quantity = 1 }) {
  try {
    sessionStorage.setItem(
      CHECKOUT_STORAGE_KEY,
      JSON.stringify({ buyNow: { variantId, productName, imageUrl, size, color, unitPrice, quantity } })
    );
  } catch {
    // bỏ qua nếu trình duyệt chặn sessionStorage
  }
}
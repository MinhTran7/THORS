// Hàm điều hướng sang trang đặt hàng. Dùng ở trang giỏ hàng và trang chi tiết sản phẩm.

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

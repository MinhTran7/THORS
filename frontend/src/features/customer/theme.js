// Màu và kiểu nút / thẻ dùng chung (địa chỉ giao hàng của khách, các trang sản phẩm/danh mục), tông trầm như màn khách hàng.
// Giữ tên cũ: cyan = nền nút chính (đen), cyanInk = chữ trên nền đó (trắng), teal = màu nhấn (đỏ đô).
export const C = {
  cyan: '#111111',
  cyanHover: '#2B2B2B',
  cyanInk: '#FFFFFF',
  teal: '#8A2B2B',
  text: '#111111',
  muted: '#5C5650',
  border: '#E6E3DE',
  borderLight: '#EFEBE5',
  surface: '#FFFFFF',
  error: '#D14343'
};

export const primaryButtonSx = {
  bgcolor: C.cyan,
  color: C.cyanInk,
  fontWeight: 800,
  fontSize: 14.5,
  px: 3,
  height: 46,
  borderRadius: '14px',
  textTransform: 'none',
  boxShadow: 'none',
  '&:hover': { bgcolor: C.cyanHover, boxShadow: 'none' },
  '&.Mui-disabled': { bgcolor: '#E6E3DE', color: '#9A928A' }
};

export const outlineButtonSx = {
  textTransform: 'none',
  fontWeight: 700,
  fontSize: 14.5,
  color: C.text,
  bgcolor: C.surface,
  px: 2.5,
  height: 46,
  borderRadius: '14px',
  border: `1.5px solid ${C.border}`,
  '&:hover': { bgcolor: '#FAF8F5', borderColor: C.cyan }
};

// Thẻ trắng bo góc, bóng nhẹ như khung form Đăng nhập
export const cardSx = {
  bgcolor: C.surface,
  borderRadius: '24px',
  border: 0,
  boxShadow: '0 24px 50px -30px rgba(17, 17, 17, 0.25), 0 0 0 1px #E6E3DE'
};

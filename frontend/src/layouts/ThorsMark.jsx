import { ThorsLogo } from 'features/auth/components/ShopAuthArt';

// Biểu tượng THORS: dùng chung logo của trang Đăng nhập / cửa hàng để mọi màn hình giống nhau.
export default function ThorsMark({ height = 30 }) {
  return <ThorsLogo size={Math.round(height / 0.94)} />;
}

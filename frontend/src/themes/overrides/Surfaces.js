// ==============================|| OVERRIDES - CARD / DIALOG / ALERT ||============================== //
// Bo góc mặc định đồng bộ với trang Đăng nhập. Trang nào tự đặt borderRadius trong sx thì vẫn giữ giá trị của trang.

export default function Surfaces() {
  return {
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 20 }
      }
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 24 }
      }
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 14 }
      }
    },
    MuiMenu: {
      styleOverrides: {
        paper: { borderRadius: 14 }
      }
    },
    MuiPopover: {
      styleOverrides: {
        paper: { borderRadius: 14 }
      }
    }
  };
}

export default function Drawer() {
  return {
    MuiDrawer: {
      defaultProps: {
        disableScrollLock: true
      },
      styleOverrides: {
        paper: {
          backgroundImage: 'none'
        }
      }
    }
  };
}

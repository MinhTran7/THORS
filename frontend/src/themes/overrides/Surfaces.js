export default function Surfaces() {
  return {
    MuiCard: {
      styleOverrides: {
        root: { borderRadius: 20 }
      }
    },
    MuiModal: {
      defaultProps: {
        disableScrollLock: true
      }
    },
    MuiDialog: {
      defaultProps: {
        disableScrollLock: true
      },
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
      defaultProps: {
        disableScrollLock: true
      },
      styleOverrides: {
        paper: { borderRadius: 14 }
      }
    },
    MuiPopover: {
      defaultProps: {
        disableScrollLock: true
      },
      styleOverrides: {
        paper: { borderRadius: 14 }
      }
    }
  };
}

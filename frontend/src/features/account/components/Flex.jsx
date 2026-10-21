import { Stack as MuiStack } from '@mui/material';

// MUI 9 không còn nhận alignItems/justifyContent làm prop của Stack (chúng bị đẩy xuống thẻ DOM và không có tác dụng).
// Stack này vẫn cho phép viết <Stack alignItems="center">, nhưng chuyển chúng vào sx.
export function Stack({ alignItems, justifyContent, sx, ...rest }) {
  return (
    <MuiStack
      {...rest}
      sx={{ ...(alignItems !== undefined && { alignItems }), ...(justifyContent !== undefined && { justifyContent }), ...sx }}
    />
  );
}
import { RouterProvider } from 'react-router-dom';
import router from 'routes';
import ThemeCustomization from 'themes';
import { AuthProvider } from 'features/auth/AuthProvider';
export default function App() {
  return (
    <ThemeCustomization>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ThemeCustomization>
  );
}

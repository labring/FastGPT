import { createAuthProvider, type AuthProvider } from 'tushan';

export const authProvider: AuthProvider = createAuthProvider({
  loginUrl: `${import.meta.env.VITE_PUBLIC_SERVER_URL}/api/login`
});

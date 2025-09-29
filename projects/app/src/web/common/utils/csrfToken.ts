import { generateCsrfToken } from '@/web/support/user/api';

const CSRF_TOKEN_STORAGE_KEY = 'csrf_token';
const CSRF_EXPIRES_STORAGE_KEY = 'csrf_expires';

interface CsrfTokenData {
  token: string;
  expiresAt: number;
}

export const getCsrfToken = async (): Promise<string> => {
  const storedToken = getStoredToken();

  if (storedToken && isTokenValid(storedToken.expiresAt)) {
    return storedToken.token;
  }

  return fetchNewToken();
};

const getStoredToken = (): CsrfTokenData | null => {
  const token = localStorage.getItem(CSRF_TOKEN_STORAGE_KEY);
  const expiresAt = localStorage.getItem(CSRF_EXPIRES_STORAGE_KEY);

  if (token && expiresAt) {
    return {
      token,
      expiresAt: parseInt(expiresAt, 10)
    };
  }

  return null;
};

const isTokenValid = (expiresAt: number): boolean => {
  const currentTime = Math.floor(Date.now() / 1000);
  const bufferTime = 10 * 60;

  return expiresAt > currentTime + bufferTime;
};

const fetchNewToken = async (): Promise<string> => {
  const csrfTokenData = await generateCsrfToken();

  if (csrfTokenData.csrfToken && csrfTokenData.expiresAt) {
    localStorage.setItem(CSRF_TOKEN_STORAGE_KEY, csrfTokenData.csrfToken);
    localStorage.setItem(CSRF_EXPIRES_STORAGE_KEY, csrfTokenData.expiresAt.toString());
    return csrfTokenData.csrfToken;
  }
  return '';
};

export const clearCsrfToken = (): void => {
  localStorage.removeItem(CSRF_TOKEN_STORAGE_KEY);
  localStorage.removeItem(CSRF_EXPIRES_STORAGE_KEY);
};

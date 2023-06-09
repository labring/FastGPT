import { AuthProvider } from 'tushan';

export const authProvider: AuthProvider = {
  login: ({ username, password }) => {
    if (username !== 'tushan' || password !== 'tushan') {
      return Promise.reject();
    }

    localStorage.setItem('username', username);
    return Promise.resolve();
  },
  logout: () => {
    localStorage.removeItem('username');
    return Promise.resolve();
  },
  checkAuth: () =>
    localStorage.getItem('username') ? Promise.resolve() : Promise.reject(),
  checkError: (error) => {
    const status = error.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem('username');
      return Promise.reject();
    }

    return Promise.resolve();
  },
  getIdentity: () =>
    Promise.resolve({
      id: '0',
      fullName: 'Admin',
    }),
  getPermissions: () => Promise.resolve(''),
};

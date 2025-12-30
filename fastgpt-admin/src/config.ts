/**
 * 前端环境配置
 */

const isDev = import.meta.env.DEV;

interface Config {
  AUTH_API_URL: string;
  FASTGPT_URL: string;
  ADMIN_URL: string;
  PROXY_URL: string;
}

const config: Config = {
  development: {
    AUTH_API_URL: window.location.hostname === 'localhost' ? 'http://localhost:8080/api' : 'http://10.14.53.120:8080/api',
    FASTGPT_URL: window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'http://10.14.53.120:3000',
    ADMIN_URL: window.location.hostname === 'localhost' ? 'http://localhost:5173' : 'http://10.14.53.120:5173',
    PROXY_URL: window.location.hostname === 'localhost' ? 'http://localhost:3004' : 'http://10.14.53.120:3004'
  },
  production: {
    AUTH_API_URL: import.meta.env.VITE_AUTH_API_URL || 'https://your-domain.com:3003',
    FASTGPT_URL: import.meta.env.VITE_FASTGPT_URL || 'https://your-domain.com',
    ADMIN_URL: import.meta.env.VITE_ADMIN_URL || 'https://admin.your-domain.com',
    PROXY_URL: import.meta.env.VITE_PROXY_URL || 'https://proxy.your-domain.com'
  }
}[isDev ? 'development' : 'production'];

export default config;
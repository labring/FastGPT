import FingerprintJS from '@fingerprintjs/fingerprintjs';

export const getUserFingerprint = async () => {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  console.log(result.visitorId);
};

export const subRoute = process.env.NEXT_PUBLIC_BASE_URL;

export const getWebReqUrl = (url: string = '') => {
  if (!url) return '/';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;
  if (!baseUrl) return url;

  if (!url.startsWith('/') || url.startsWith(baseUrl)) return url;
  return `${baseUrl}${url}`;
};

export const isMobile = () => {
  // 服务端渲染时返回 false
  if (typeof window === 'undefined') return false;

  // 1. 检查 User-Agent
  const userAgent = navigator.userAgent.toLowerCase();
  const mobileKeywords = [
    'android',
    'iphone',
    'ipod',
    'ipad',
    'windows phone',
    'blackberry',
    'webos',
    'iemobile',
    'opera mini'
  ];
  const isMobileUA = mobileKeywords.some((keyword) => userAgent.includes(keyword));

  // 2. 检查屏幕宽度
  const isMobileWidth = window.innerWidth <= 900;

  // 3. 检查是否支持触摸事件（排除触控屏PC）
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // 综合判断：满足以下任一条件即视为移动端
  return isMobileUA || (isMobileWidth && isTouchDevice);
};

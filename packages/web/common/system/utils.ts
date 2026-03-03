import FingerprintJS from '@fingerprintjs/fingerprintjs';

export const getUserFingerprint = async () => {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  console.log(result.visitorId);
};

export const subRoute = process.env.NEXT_PUBLIC_BASE_URL || '';

export const getWebReqUrl = (url: string = '') => {
  if (!url) return '/';
  if (!subRoute) return url;

  if (!url.startsWith('/') || url.startsWith(subRoute)) return url;
  return `${subRoute}${url}`;
};

export const isMobile = () => {
  // SSR return false
  if (typeof window === 'undefined') return false;

  // 1. Check User-Agent
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

  // 2. Check screen width
  const isMobileWidth = window.innerWidth <= 900;

  // 3. Check if touch events are supported (exclude touch screen PCs)
  const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // If any of the following conditions are met, it is considered a mobile device
  return isMobileUA || (isMobileWidth && isTouchDevice);
};

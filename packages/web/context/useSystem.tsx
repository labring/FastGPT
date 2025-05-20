import React, { type ReactNode, useMemo, useState, useEffect } from 'react';
import { createContext } from 'use-context-selector';
import Cookies from 'js-cookie';

const CookieKey = 'NEXT_DEVICE_SIZE';
const setSize = (value: string) => {
  Cookies.set(CookieKey, value, { expires: 30 });
  localStorage.setItem(CookieKey, value);
};

type useSystemContextType = {
  isPc: boolean;
};

export const useSystemStoreContext = createContext<useSystemContextType>({
  isPc: true
});

const isMobile = () => {
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

const SystemStoreContextProvider = ({
  children,
  device
}: {
  children: ReactNode;
  device?: 'pc' | 'mobile' | null;
}) => {
  const [isPc, setIsPc] = useState(device === 'pc');

  useEffect(() => {
    // 服务端渲染时使用默认值
    if (typeof window === 'undefined') {
      setIsPc(device === 'pc');
      return;
    }

    // 初始判断
    setIsPc(!isMobile());

    // 监听窗口大小变化
    const handleResize = () => {
      setIsPc(!isMobile());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [device]);

  // 当 isPc 变化时更新 Cookie
  useEffect(() => {
    setSize(isPc ? 'pc' : 'mobile');
  }, [isPc]);

  const contextValue = useMemo(
    () => ({
      isPc
    }),
    [isPc]
  );

  return (
    <useSystemStoreContext.Provider value={contextValue}>{children}</useSystemStoreContext.Provider>
  );
};

export default SystemStoreContextProvider;

import { useState, useEffect } from 'react';

export const useScreen = () => {
  const [screenWidth, setScreenWidth] = useState(window?.innerWidth || 0);
  const [screenHeight, setScreenHeight] = useState(window?.innerHeight || 0);

  useEffect(() => {
    function handleResize() {
      setScreenWidth(window.innerWidth);
      setScreenHeight(window.innerHeight);
    }

    window.addEventListener('resize', handleResize);

    // 清理函数
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []); // 空数组表示这个effect只在组件挂载和卸载时运行

  return {
    screenWidth,
    screenHeight
  };
};

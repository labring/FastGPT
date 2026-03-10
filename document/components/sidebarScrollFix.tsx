'use client';

import { useEffect } from 'react';

/**
 * 修复侧边栏滚动焦点问题
 * 当鼠标从内容区移动到侧边栏时，确保滚动事件作用于侧边栏而不是内容区
 */
export function SidebarScrollFix() {
  useEffect(() => {
    const handleMouseEnter = (e: MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      // 鼠标进入侧边栏时，聚焦到侧边栏的滚动容器
      if (target) {
        target.focus({ preventScroll: true });
      }
    };

    // 桌面端侧边栏
    const sidebar = document.querySelector('#nd-sidebar');
    // 移动端侧边栏
    const sidebarMobile = document.querySelector('#nd-sidebar-mobile');

    if (sidebar) {
      sidebar.addEventListener('mouseenter', handleMouseEnter as EventListener);
      // 确保侧边栏可以接收焦点
      (sidebar as HTMLElement).setAttribute('tabindex', '-1');
    }

    if (sidebarMobile) {
      sidebarMobile.addEventListener('mouseenter', handleMouseEnter as EventListener);
      (sidebarMobile as HTMLElement).setAttribute('tabindex', '-1');
    }

    return () => {
      if (sidebar) {
        sidebar.removeEventListener('mouseenter', handleMouseEnter as EventListener);
      }
      if (sidebarMobile) {
        sidebarMobile.removeEventListener('mouseenter', handleMouseEnter as EventListener);
      }
    };
  }, []);

  return null;
}

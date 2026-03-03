'use client';

import { usePathname } from 'next/navigation';
import { useRef } from 'react';
import { useSidebar } from 'fumadocs-ui/provider';

/**
 * 移动端：点击一级 tab 切换时不关闭 sidebar，点击二级路由时正常关闭。
 * 
 * 在渲染阶段检测是否为 tab 间切换，是则设 closeOnRedirect = false。
 */
export function SidebarKeepOpen({ tabUrls }: { tabUrls: string[] }) {
  const pathname = usePathname();
  const prevPathname = useRef(pathname);
  const { closeOnRedirect } = useSidebar();

  if (prevPathname.current !== pathname) {
    const prev = prevPathname.current;
    prevPathname.current = pathname;

    // 判断是否是 tab 间切换（从一个 tab 根路径跳到另一个 tab 根路径）
    const prevTab = tabUrls.find((url) => prev.startsWith(url));
    const currTab = tabUrls.find((url) => pathname.startsWith(url));

    if (prevTab && currTab && prevTab !== currTab) {
      // 一级 tab 切换 → 不关闭 sidebar
      closeOnRedirect.current = false;
    }
    // 否则（二级路由跳转）→ 保持默认行为（关闭 sidebar）
  }

  return null;
}

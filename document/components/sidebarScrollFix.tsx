'use client';

import { useEffect } from 'react';

export const SIDEBAR_SCROLL_STORAGE_KEY = 'fastgpt-docs-sidebar-scroll-top';

const RESTORE_SIDEBAR_SCROLL_SCRIPT = `(function(){try{var vp=document.querySelector('#nd-sidebar [data-radix-scroll-area-viewport]');if(!vp)return;var key='${SIDEBAR_SCROLL_STORAGE_KEY}';var raw=sessionStorage.getItem(key);if(raw!==null){var saved=Number(raw);if(Number.isFinite(saved)&&saved>=0){vp.scrollTop=saved;}}var active=vp.querySelector('a[data-active="true"]')||vp.querySelector('a[href="'+location.pathname+'"]');if(active){var vpRect=vp.getBoundingClientRect();var activeRect=active.getBoundingClientRect();if(vpRect.height>0&&(activeRect.top<vpRect.top||activeRect.bottom>vpRect.bottom)){vp.scrollTop+=activeRect.top-vpRect.top-vpRect.height/2+activeRect.height/2;sessionStorage.setItem(key,String(vp.scrollTop));}}}catch(e){}})();`;

/**
 * Restores the desktop sidebar scroll position synchronously before first paint
 * to prevent the sidebar from jumping to the top on page navigation.
 */
export function SidebarScrollRestoreScript() {
  return <script dangerouslySetInnerHTML={{ __html: RESTORE_SIDEBAR_SCROLL_SCRIPT }} />;
}

/**
 * Keeps sidebar wheel focus responsive and persists the desktop sidebar scroll
 * position across document navigations.
 */
export function SidebarScrollFix() {
  useEffect(() => {
    const handleMouseEnter = (e: MouseEvent) => {
      const target = e.currentTarget as HTMLElement;
      if (target) {
        target.focus({ preventScroll: true });
      }
    };

    const sidebar = document.querySelector('#nd-sidebar');
    const sidebarMobile = document.querySelector('#nd-sidebar-mobile');
    const viewport = sidebar?.querySelector<HTMLElement>('[data-radix-scroll-area-viewport]');

    const saveScrollTop = () => {
      if (!viewport) return;
      try {
        sessionStorage.setItem(SIDEBAR_SCROLL_STORAGE_KEY, String(viewport.scrollTop));
      } catch {
        // Ignore storage errors in restricted browsing contexts.
      }
    };

    if (sidebar) {
      sidebar.addEventListener('mouseenter', handleMouseEnter as EventListener);
      (sidebar as HTMLElement).setAttribute('tabindex', '-1');
    }

    if (viewport) {
      viewport.addEventListener('scroll', saveScrollTop, { passive: true });
      viewport.addEventListener('pointerdown', saveScrollTop, { passive: true });
      viewport.addEventListener('click', saveScrollTop, { passive: true });
    }

    if (sidebarMobile) {
      sidebarMobile.addEventListener('mouseenter', handleMouseEnter as EventListener);
      (sidebarMobile as HTMLElement).setAttribute('tabindex', '-1');
    }

    return () => {
      if (sidebar) {
        sidebar.removeEventListener('mouseenter', handleMouseEnter as EventListener);
      }
      if (viewport) {
        viewport.removeEventListener('scroll', saveScrollTop);
        viewport.removeEventListener('pointerdown', saveScrollTop);
        viewport.removeEventListener('click', saveScrollTop);
      }
      if (sidebarMobile) {
        sidebarMobile.removeEventListener('mouseenter', handleMouseEnter as EventListener);
      }
    };
  }, []);

  return null;
}

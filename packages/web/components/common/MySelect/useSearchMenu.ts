import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import type { ButtonProps } from '@chakra-ui/react';
import type { SelectOption } from './type';

type UseSearchMenuParams<T> = {
  isSearch: boolean;
  isOpen: boolean;
  width: ButtonProps['width'];
  list: SelectOption<T>[];
  buttonRef: React.RefObject<HTMLButtonElement>;
  searchInputRef: React.RefObject<HTMLInputElement>;
  onClose: () => void;
  focusButton: () => void;
};

export const useSearchMenu = <T>({
  isSearch,
  isOpen,
  width,
  list,
  buttonRef,
  searchInputRef,
  onClose,
  focusButton
}: UseSearchMenuParams<T>) => {
  const [search, setSearch] = useState('');
  const [menuMinW, setMenuMinW] = useState<string>();
  const fallbackMenuMinW = useMemo(() => {
    return Array.isArray(width) ? width.map((item) => `${item} !important`) : `${width} !important`;
  }, [width]);

  const resetSearch = () => {
    if (isSearch) {
      setSearch('');
    }
  };

  const handleSearchInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // 搜索框在菜单内独立处理输入，避免 Chakra Menu 用键盘事件切换焦点或关闭菜单。
    e.stopPropagation();

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      focusButton();
    }
  };
  const handleSearchInputKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
  };

  const filterList = useMemo(() => {
    if (!isSearch || !search) {
      return list;
    }
    const keyword = search.toLowerCase();
    return list.filter((item) => {
      const text = [item.label, item.alias, item.value]
        .filter((value): value is string | number => {
          return typeof value === 'string' || typeof value === 'number';
        })
        .join('')
        .toLowerCase();

      return text.includes(keyword);
    });
  }, [list, search, isSearch]);

  useEffect(() => {
    if (isOpen && isSearch) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
    }
  }, [isSearch, isOpen, searchInputRef]);

  useEffect(() => {
    if (!isOpen) return;

    const updateMenuMinW = () => {
      const buttonWidth = buttonRef.current?.clientWidth;
      setMenuMinW(buttonWidth ? `${buttonWidth}px !important` : undefined);
    };
    const frameId = window.requestAnimationFrame(updateMenuMinW);

    window.addEventListener('resize', updateMenuMinW);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('resize', updateMenuMinW);
    };
  }, [buttonRef, isOpen]);

  return {
    search,
    setSearch,
    resetSearch,
    menuMinW,
    fallbackMenuMinW,
    handleSearchInputKeyDown,
    handleSearchInputKeyUp,
    filterList
  };
};

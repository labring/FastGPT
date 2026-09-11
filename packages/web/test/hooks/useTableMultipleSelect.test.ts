// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const reactGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};
reactGlobals.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@chakra-ui/react', () => ({
  Box: () => null,
  Flex: () => null,
  Checkbox: () => null
}));

import { useTableMultipleSelect } from '../../hooks/useTableMultipleSelect';

type Item = { _id: string };

describe('useTableMultipleSelect', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  const renderSelectHook = () => {
    let api: ReturnType<typeof useTableMultipleSelect<Item>> | undefined;
    let updateList: React.Dispatch<React.SetStateAction<Item[]>> | undefined;

    const Harness = () => {
      const [list, setList] = React.useState<Item[]>([]);
      updateList = setList;
      api = useTableMultipleSelect<Item>({ list, getItemId: (item) => item._id });
      return null;
    };

    act(() => {
      root.render(React.createElement(Harness));
    });

    return {
      getApi: () => api!,
      getSelectedIds: () => api!.selectedItems.map((item) => item._id),
      setList: (next: Item[]) =>
        act(() => {
          updateList!(next);
        })
    };
  };

  it('取消全选时只清除当前列表的选中项', () => {
    const page1: Item[] = [{ _id: 'a' }, { _id: 'b' }];
    const page2: Item[] = [{ _id: 'c' }, { _id: 'd' }];
    const { getApi, getSelectedIds, setList } = renderSelectHook();

    // 第 1 页勾选一条
    setList(page1);
    act(() => {
      getApi().toggleSelect(page1[0]);
    });
    expect(getSelectedIds()).toEqual(['a']);

    // 翻到第 2 页并全选本页，第 1 页的选中项保留
    setList(page2);
    act(() => {
      getApi().selectAllTrigger();
    });
    expect(getSelectedIds()).toEqual(['a', 'c', 'd']);
    expect(getApi().isSelecteAll).toBe(true);

    // 再点一次取消全选，只应该取消第 2 页
    act(() => {
      getApi().selectAllTrigger();
    });
    expect(getSelectedIds()).toEqual(['a']);
    expect(getApi().isSelecteAll).toBe(false);
  });

  it('单页场景下取消全选仍然清空所有选中项', () => {
    const list: Item[] = [{ _id: 'a' }, { _id: 'b' }];
    const { getApi, getSelectedIds, setList } = renderSelectHook();

    setList(list);
    act(() => {
      getApi().selectAllTrigger();
    });
    expect(getSelectedIds()).toEqual(['a', 'b']);
    expect(getApi().hasSelections).toBe(true);

    act(() => {
      getApi().selectAllTrigger();
    });
    expect(getSelectedIds()).toEqual([]);
    expect(getApi().hasSelections).toBe(false);
  });
});

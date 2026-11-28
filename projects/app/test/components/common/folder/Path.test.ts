import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderedItems: [] as Array<{ text: string; clickable: boolean; onClick?: () => void }>,
  menuItems: [] as Array<{ label: string; onClick: () => void }>
}));

vi.mock('next-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}));

vi.mock('@chakra-ui/react', () => ({
  Flex: ({ children }: { children?: React.ReactNode }) =>
    React.createElement('div', null, children),
  Box: ({
    children,
    cursor,
    onClick
  }: {
    children?: React.ReactNode;
    cursor?: string;
    onClick?: () => void;
  }) => {
    if (typeof children === 'string') {
      mocks.renderedItems.push({
        text: children,
        clickable: cursor === 'pointer' && typeof onClick === 'function',
        onClick
      });
    }
    return React.createElement('span', null, children);
  }
}));

vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
}));
vi.mock('@fastgpt/web/components/common/MyMenu', () => ({
  default: ({
    menuList
  }: {
    menuList: Array<{ children: Array<{ label: React.ReactElement; onClick: () => void }> }>;
  }) => {
    menuList.forEach((group) => {
      group.children.forEach((item) => {
        const label =
          typeof item.label?.props?.children === 'string' ? item.label.props.children : '';
        mocks.menuItems.push({ label, onClick: item.onClick });
      });
    });
    return React.createElement('span', null, '...');
  }
}));

import FolderPath from '@/components/common/folder/Path';

describe('FolderPath', () => {
  beforeEach(() => {
    mocks.renderedItems = [];
    mocks.menuItems = [];
  });

  it('forbids clicking the last directory item by default and navigates on ancestor clicks', () => {
    const onClick = vi.fn();

    renderToStaticMarkup(
      React.createElement(FolderPath, {
        rootName: '知识库',
        paths: [
          { parentId: 'folder-1', parentName: '目录A' },
          { parentId: 'folder-2', parentName: '目录B' }
        ],
        onClick
      })
    );

    expect(mocks.renderedItems.map(({ text, clickable }) => ({ text, clickable }))).toEqual([
      { text: '知识库', clickable: true },
      { text: '目录A', clickable: true },
      { text: '目录B', clickable: false }
    ]);

    mocks.renderedItems[0].onClick?.();
    mocks.renderedItems[1].onClick?.();
    mocks.renderedItems[2].onClick?.();

    expect(onClick).toHaveBeenNthCalledWith(1, '');
    expect(onClick).toHaveBeenNthCalledWith(2, 'folder-1');
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  it('appends currentName as a non-clickable leaf even at root or when forbidLastClick is false', () => {
    const onClick = vi.fn();

    renderToStaticMarkup(
      React.createElement(FolderPath, {
        rootName: 'Agent',
        paths: [],
        currentName: 'FastGPT迁移测试助手',
        FirstPathDom: React.createElement('div', null, 'Fallback'),
        forbidLastClick: false,
        onClick
      })
    );

    expect(mocks.renderedItems.map(({ text, clickable }) => ({ text, clickable }))).toEqual([
      { text: 'Agent', clickable: true },
      { text: 'FastGPT迁移测试助手', clickable: false }
    ]);

    mocks.renderedItems[0].onClick?.();
    mocks.renderedItems[1].onClick?.();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('');
  });

  it('collapses middle ancestors into ellipsis menu when full path exceeds 3 levels', () => {
    const onClick = vi.fn();

    renderToStaticMarkup(
      React.createElement(FolderPath, {
        rootName: '知识库',
        paths: [
          { parentId: 'f1', parentName: '一级目录' },
          { parentId: 'f2', parentName: '二级目录' }
        ],
        currentName: '测试测',
        onClick
      })
    );

    expect(mocks.renderedItems.map(({ text, clickable }) => ({ text, clickable }))).toEqual([
      { text: '知识库', clickable: true },
      { text: '二级目录', clickable: true },
      { text: '测试测', clickable: false }
    ]);
    expect(mocks.menuItems.map((item) => item.label)).toEqual(['一级目录']);

    mocks.menuItems[0].onClick();
    mocks.renderedItems[1].onClick?.();
    expect(onClick).toHaveBeenNthCalledWith(1, 'f1');
    expect(onClick).toHaveBeenNthCalledWith(2, 'f2');
  });

  it('renders FirstPathDom when at root without currentName', () => {
    const html = renderToStaticMarkup(
      React.createElement(FolderPath, {
        rootName: '知识库',
        paths: [],
        FirstPathDom: React.createElement('div', null, '我的知识库'),
        onClick: vi.fn()
      })
    );

    expect(html).toContain('我的知识库');
    expect(mocks.renderedItems).toEqual([]);
  });
});

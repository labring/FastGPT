import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppTemplate from '@/pageComponents/admin/templates/app';
import { getSystemTemplates, putUpdateTemplateOrder } from '@/web/core/app/templates/api';

const controls = vi.hoisted(() => ({ drag: undefined as any, list: [] as any[] }));
vi.mock('@/web/core/app/templates/api', () => ({
  getSystemTemplates: vi.fn(),
  getTemplateTypes: vi.fn().mockResolvedValue([]),
  putUpdateTemplateOrder: vi.fn().mockResolvedValue(undefined)
}));
vi.mock('@fastgpt/web/hooks/useRequest', async () => {
  const { useRequest } = await import('ahooks');
  return {
    useRequest: (service: any, options: any) => useRequest(service, { manual: true, ...options })
  };
});
vi.mock('@chakra-ui/react', async () => {
  const { createElement } = await import('react');
  const Box = ({ children }: any) => createElement('div', null, children);
  return {
    Box,
    Flex: Box,
    Button: Box,
    useDisclosure: () => ({ isOpen: false, onOpen: vi.fn(), onClose: vi.fn() })
  };
});
vi.mock('@fastgpt/web/components/common/MyBox', () => ({
  default: ({ children }: any) => children
}));
vi.mock('@fastgpt/web/components/common/MySelect', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/EmptyTip', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/DndDrag', () => ({
  default: ({ dataList, onDragEndCb }: any) => {
    controls.list = dataList;
    controls.drag = onDragEndCb;
    return dataList.map((item: any) => item.templateId).join(',');
  },
  Draggable: () => null
}));
vi.mock('@/pageComponents/admin/templates/app/components/ItemConfigModal', () => ({
  default: () => null,
  defaultTemplate: {}
}));
vi.mock('@/pageComponents/admin/templates/app/components/QuickTemplateModal', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/admin/templates/app/components/TemplateItemCard', () => ({
  default: () => null
}));
vi.mock('@/pageComponents/admin/templates/app/components/TypeModal', () => ({
  default: () => null
}));

describe('AppTemplate request synchronization', () => {
  let root: Root;
  let container: HTMLDivElement;
  let commits: number;
  const pending: { resolve: (items: any[]) => void; reject: (error: Error) => void }[] = [];

  const render = async () => {
    await act(async () =>
      root.render(
        React.createElement(
          React.Profiler,
          {
            id: 'templates',
            onRender: () => {
              if (++commits > 30) throw new Error('Unbounded effect updates');
            }
          },
          React.createElement(AppTemplate)
        )
      )
    );
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    // app 侧源码使用经典 JSX 转换，被测组件依赖全局 React
    vi.stubGlobal('React', React);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.clearAllMocks();
    commits = 0;
    controls.list = [];
    controls.drag = undefined;
    pending.length = 0;
    vi.mocked(getSystemTemplates).mockImplementation(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    vi.unstubAllGlobals();
  });

  it.each(['pending', 'empty', 'failure'])(
    'does not loop when the request is %s',
    async (result) => {
      await render();
      await act(async () => {
        if (result === 'empty') pending[0].resolve([]);
        if (result === 'failure') pending[0].reject(new Error('offline'));
      });
      await render();
      expect(getSystemTemplates).toHaveBeenCalledTimes(1);
      expect(controls.list).toEqual([]);
      expect(commits).toBeLessThan(15);
    }
  );

  it('preserves local drag order while refreshing and applies an empty server response', async () => {
    const a = { templateId: 'a', tags: [] };
    const b = { templateId: 'b', tags: [] };
    await render();
    await act(async () => pending[0].resolve([a, b]));
    expect(controls.list).toEqual([a, b]);

    await act(async () => controls.drag([b, a]));
    await render();
    expect(controls.list).toEqual([b, a]);
    expect(putUpdateTemplateOrder).toHaveBeenCalledWith({
      templates: [
        { templateId: 'b', order: 0 },
        { templateId: 'a', order: 1 }
      ]
    });
    expect(getSystemTemplates).toHaveBeenCalledTimes(2);

    await act(async () => pending[1].resolve([]));
    expect(container.textContent).not.toContain('b,a');
    expect(commits).toBeLessThan(20);
  });
});

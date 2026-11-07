import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PluginEditor from '@/pageComponents/app/detail/Plugin';

const mocks = vi.hoisted(() => ({ initData: vi.fn() }));

vi.mock('@/pageComponents/app/detail/context', async () => {
  const { createContext } = await import('use-context-selector');
  return {
    TabEnum: { appEdit: 'appEdit', publish: 'publish', logs: 'logs' },
    AppContext: createContext({
      appDetail: { _id: 'tool-1', nodes: [], edges: [], permission: { hasWritePer: true } },
      currentTab: 'appEdit'
    })
  };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context/workflowUtilsContext', async () => {
  const { createContext } = await import('use-context-selector');
  return { WorkflowUtilsContext: createContext({ initData: mocks.initData }) };
});
vi.mock('@/pageComponents/app/detail/WorkflowComponents/context', () => ({
  ReactFlowCustomProvider: ({ children }: React.PropsWithChildren) => children
}));
vi.mock('@/pageComponents/app/detail/Plugin/Header', () => ({ default: () => null }));
vi.mock('@/pageComponents/app/detail/constants', () => ({ workflowBoxStyles: {} }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@chakra-ui/react', () => ({
  Flex: ({ children }: React.PropsWithChildren) => React.createElement('div', null, children)
}));
vi.mock('@/components/core/app/useAppEditorUIState', () => ({
  useAppEditorUIState: () => ({ completeWorkflowBuilderFirstEntryGuide: vi.fn() })
}));

// 画布渲染与节点接口不属于本用例；保留真实 UI Hook，验证页面为独立入口提供共享面板状态。
vi.mock('@/pageComponents/app/detail/WorkflowComponents/Flow', async () => {
  const { useWorkflowBuilderUI } =
    await import('@/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/hooks/useWorkflowBuilderUI');
  const Toolbar = () => {
    const { toggleLeftPanel, entryAccess } = useWorkflowBuilderUI();
    return React.createElement(
      'div',
      null,
      React.createElement(
        'button',
        { onClick: () => toggleLeftPanel('nodeTemplates') },
        '添加节点'
      ),
      React.createElement('button', { onClick: () => toggleLeftPanel('systemConfig') }, '设置'),
      entryAccess !== 'hidden' && React.createElement('button', null, 'AI Builder')
    );
  };
  const Panels = () => {
    const { activeLeftPanel, closeLeftPanel } = useWorkflowBuilderUI();
    if (!activeLeftPanel) return null;
    return React.createElement(
      'section',
      { 'data-panel': activeLeftPanel },
      React.createElement('button', { onClick: () => closeLeftPanel() }, '关闭')
    );
  };
  return {
    default: () =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(Toolbar),
        React.createElement(Panels)
      )
  };
});

describe('workflow tool editor panels', () => {
  let dom: JSDOM;
  let root: Root;

  beforeEach(async () => {
    mocks.initData.mockClear();
    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    root = createRoot(document.getElementById('root')!);
    await act(async () => root.render(React.createElement(PluginEditor)));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const clickButton = async (label: string) => {
    const button = Array.from(document.querySelectorAll('button')).find(
      (item) => item.textContent === label
    );
    expect(button).toBeDefined();
    await act(async () => button!.click());
  };

  it('opens, switches and closes node templates and settings through shared state', async () => {
    expect(mocks.initData).toHaveBeenCalledWith({ nodes: [], edges: [] }, true);
    expect(document.querySelector('section')).toBeNull();

    await clickButton('添加节点');
    expect(document.querySelector('section')?.dataset.panel).toBe('nodeTemplates');
    await clickButton('设置');
    expect(document.querySelectorAll('section')).toHaveLength(1);
    expect(document.querySelector('section')?.dataset.panel).toBe('systemConfig');
    await clickButton('关闭');
    expect(document.querySelector('section')).toBeNull();

    await clickButton('设置');
    expect(document.querySelector('section')?.dataset.panel).toBe('systemConfig');
    await clickButton('设置');
    expect(document.querySelector('section')).toBeNull();
    await clickButton('添加节点');
    await clickButton('关闭');
    expect(document.querySelector('section')).toBeNull();
    expect(document.body.textContent).not.toContain('AI Builder');
  });
});

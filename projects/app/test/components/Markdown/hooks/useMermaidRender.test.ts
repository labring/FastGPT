import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mermaid } from 'mermaid';
import { useMermaidRender } from '@/components/Markdown/hooks/useMermaidRender';

const { renderMermaid, initializeMermaid } = vi.hoisted(() => ({
  renderMermaid: vi.fn<Mermaid['render']>(),
  initializeMermaid: vi.fn()
}));

// Mermaid 依赖浏览器的 SVG 布局能力；这里只替换该边界，保留真实 React 生命周期和定时器。
vi.mock('mermaid', () => ({
  default: { render: renderMermaid, mermaidAPI: { initialize: initializeMermaid } }
}));

describe('useMermaidRender', () => {
  let root: Root;
  let container: HTMLDivElement;
  let result: ReturnType<typeof useMermaidRender>;
  let nextResult: ReturnType<typeof useMermaidRender>;
  const pending: {
    resolve: (result: Awaited<ReturnType<Mermaid['render']>>) => void;
    reject: (error: Error) => void;
  }[] = [];

  const Harness = ({ code, isStreaming = false }: { code: string; isStreaming?: boolean }) => {
    result = useMermaidRender(code, isStreaming);
    return null;
  };
  const NextHarness = () => {
    nextResult = useMermaidRender('graph TD; C-->D');
    return null;
  };
  const render = async (code: string, isStreaming?: boolean) => {
    await act(async () => root.render(React.createElement(Harness, { code, isStreaming })));
    await act(async () => vi.dynamicImportSettled());
  };
  const finish = async (index: number, svg: string) => {
    await act(async () => pending[index].resolve({ svg, diagramType: 'flowchart' }));
  };
  const fail = async (index: number) => {
    await act(async () => pending[index].reject(new Error('Incomplete Mermaid syntax')));
  };

  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    vi.resetAllMocks();
    pending.length = 0;
    renderMermaid.mockImplementation(
      () => new Promise((resolve, reject) => pending.push({ resolve, reject }))
    );
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    window.close();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('initializes Mermaid without injecting error diagrams and renders fullwidth punctuation', async () => {
    await render('graph TD；A【“输入，条件：是？”】-->B（完成！）；');

    expect(initializeMermaid).toHaveBeenCalledWith(
      expect.objectContaining({ startOnLoad: false, suppressErrorRendering: true })
    );
    expect(renderMermaid).toHaveBeenCalledWith(
      expect.any(String),
      'graph TD;A["输入,条件:是?"]-->B(完成!);'
    );
    await finish(0, '<svg>complete</svg>');
    expect(result).toEqual({ svg: '<svg>complete</svg>', isLoading: false, hasError: false });
  });

  it('merges frequent streaming updates before rendering the latest code', async () => {
    await render('graph TD; A', true);
    await act(async () => vi.advanceTimersByTimeAsync(150));
    await render('graph TD; A-->B', true);
    await act(async () => vi.advanceTimersByTimeAsync(199));
    expect(renderMermaid).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(renderMermaid).toHaveBeenCalledTimes(1);
    expect(renderMermaid).toHaveBeenLastCalledWith(expect.any(String), 'graph TD; A-->B');
    await finish(0, '<svg>latest</svg>');
    expect(result.svg).toBe('<svg>latest</svg>');
  });

  it('keeps the previous diagram and hides errors for incomplete streaming code', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    await render('graph TD; A-->B');
    await finish(0, '<svg>previous</svg>');
    await render('graph TD; A[', true);
    expect(result.svg).toBe('<svg>previous</svg>');

    await act(async () => vi.advanceTimersByTimeAsync(200));
    await fail(1);
    expect(result).toEqual({ svg: '<svg>previous</svg>', isLoading: false, hasError: false });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('immediately checks the final code and reports an error after streaming ends', async () => {
    await render('graph TD; A[', true);
    await act(async () => vi.advanceTimersByTimeAsync(100));
    await render('graph TD; A[', false);
    expect(renderMermaid).toHaveBeenCalledTimes(1);
    await fail(0);
    expect(result.hasError).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(renderMermaid).toHaveBeenCalledTimes(1);

    await render('graph TD; A-->B', true);
    expect(result.hasError).toBe(false);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await finish(1, '<svg>recovered</svg>');
    await render('graph TD; A-->B', false);
    await finish(2, '<svg>final</svg>');
    expect(result).toEqual({ svg: '<svg>final</svg>', isLoading: false, hasError: false });
  });

  it.each(['resolve', 'reject'] as const)(
    'ignores an outdated render that later finishes with %s',
    async (outcome) => {
      await render('graph TD; A-->B');
      await render('graph TD; A-->C');
      await finish(1, '<svg>new</svg>');
      if (outcome === 'resolve') await finish(0, '<svg>old</svg>');
      if (outcome === 'reject') await fail(0);
      expect(result).toEqual({ svg: '<svg>new</svg>', isLoading: false, hasError: false });
    }
  );

  it('clears the diagram and error when the code becomes empty', async () => {
    await render('graph TD; A-->B');
    await finish(0, '<svg>previous</svg>');
    await render('graph TD; A[');
    await fail(1);
    expect(result.hasError).toBe(true);

    await render(' \n ');
    expect(renderMermaid).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ svg: '', isLoading: false, hasError: false });

    await render('graph TD; C[', true);
    await act(async () => vi.advanceTimersByTimeAsync(200));
    await fail(2);
    expect(result).toEqual({ svg: '', isLoading: false, hasError: false });
  });

  it('invalidates an in-flight render when its code is cleared', async () => {
    await render('graph TD; A-->B');
    await render('');
    await finish(0, '<svg>outdated</svg>');
    expect(result).toEqual({ svg: '', isLoading: false, hasError: false });
  });

  it('cancels a scheduled streaming render on unmount', async () => {
    await render('graph TD; A-->B', true);
    await act(async () => root.render(null));
    await act(async () => vi.advanceTimersByTimeAsync(200));
    expect(renderMermaid).not.toHaveBeenCalled();
  });

  it('ignores an in-flight render after unmount', async () => {
    await render('graph TD; A-->B');
    const previousResult = result;
    await act(async () => root.render(null));
    await finish(0, '<svg>unmounted</svg>');
    expect(result).toBe(previousResult);
  });

  it('does not initialize Mermaid if the component unmounts before import completes', async () => {
    // 使用同步 act 让卸载发生在动态 import 的微任务完成之前。
    act(() => {
      root.render(React.createElement(Harness, { code: 'graph TD; A-->B' }));
    });
    act(() => root.render(null));
    await act(async () => vi.dynamicImportSettled());
    expect(initializeMermaid).not.toHaveBeenCalled();
    expect(renderMermaid).not.toHaveBeenCalled();
  });

  it('reports a Mermaid initialization failure after loading ends', async () => {
    const error = new Error('Mermaid initialization failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    initializeMermaid.mockImplementationOnce(() => {
      throw error;
    });
    await render('graph TD; A-->B');
    expect(result).toEqual({ svg: '', isLoading: false, hasError: true });
    expect(consoleError).toHaveBeenCalledWith('Failed to load mermaid:', error);
    expect(renderMermaid).not.toHaveBeenCalled();
  });

  it('uses distinct render IDs across updates and concurrent instances', async () => {
    await render('graph TD; A-->B');
    await render('graph TD; A-->C');
    await act(async () =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(Harness, { code: 'graph TD; A-->C' }),
          React.createElement(NextHarness)
        )
      )
    );
    await act(async () => vi.dynamicImportSettled());
    const ids = renderMermaid.mock.calls.map(([id]) => id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(3);
    await finish(pending.length - 1, '<svg>next</svg>');
    expect(nextResult.svg).toBe('<svg>next</svg>');
  });
});

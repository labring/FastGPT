import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
let CompletionResponseExamples: (typeof import('@/pageComponents/apidoc/CompletionResponseExamples'))['CompletionResponseExamples'];

/** 模拟 Scalar 的延迟 operation/响应卡片，测试真实 portal 挂载，不依赖 Vue 运行时。 */
const operation = (version: 'v1' | 'v2', contentType = 'application/json') => `
<section id="api-1/tag/会话操作/POST/${version}/chat/completions">
  <div class="operation-details"><ul><li class="parameter-item">
    <button class="parameter-item-trigger"><span class="parameter-item-name">200</span></button>
    <div><button aria-haspopup="listbox"><span>已选内容类型: </span><span data-content-type>${contentType}</span></button></div>
  </li></ul></div>
  <div class="examples"><div class="response-card" data-version="${version}">
    <header><input class="scalar-card-checkbox-input" type="checkbox" aria-label="显示 Schema" /></header>
    <div class="scalar-card-content">原生 Schema 区域</div>
    <footer class="response-card-footer">原生示例选择器</footer>
  </div></div>
</section>`;

describe('CompletionResponseExamples', () => {
  let root: Root;
  let dom: JSDOM;
  let wrapper: HTMLDivElement;
  let container: HTMLDivElement;
  const writeText = vi.fn();

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
    for (const name of [
      'window',
      'document',
      'navigator',
      'MutationObserver',
      'Event',
      'Element',
      'HTMLElement',
      'SVGElement',
      'Node'
    ]) {
      vi.stubGlobal(name, name === 'window' ? dom.window : (dom.window as any)[name]);
    }
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    ({ CompletionResponseExamples } =
      await import('@/pageComponents/apidoc/CompletionResponseExamples'));
  });

  beforeEach(async () => {
    writeText.mockReset().mockResolvedValue(undefined);
    wrapper = document.createElement('div');
    container = document.createElement('div');
    document.body.append(wrapper, container);
    wrapper.innerHTML = operation('v1') + operation('v2');
    root = createRoot(container);
    await act(async () =>
      root.render(
        React.createElement(CompletionResponseExamples, { rootRef: { current: wrapper } })
      )
    );
    await ready('v1');
    await ready('v2');
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    wrapper.remove();
    container.remove();
  });

  afterAll(() => {
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const card = (version = 'v2') =>
    wrapper.querySelector<HTMLElement>(`[data-version="${version}"]`)!;
  const code = (version = 'v2') =>
    card(version).querySelector('[role="tabpanel"]:not([hidden]) pre')!.textContent!;
  const ready = async (version = 'v2') => {
    await act(async () => {
      await vi.waitFor(
        () =>
          expect(
            card(version).querySelector('[role="tabpanel"]:not([hidden]) .scalar-code-block pre')
          ).not.toBeNull(),
        { timeout: 10000 }
      );
    });
  };
  const format = async (value: string, version = 'v2') => {
    const label = card(version).closest('section')!.querySelector('[data-content-type]')!;
    await act(async () => {
      label.firstChild!.textContent = value;
    });
    await ready(version);
  };
  const tab = (label: string, version = 'v2') =>
    [...card(version).querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (element) => element.textContent === label
    )!;
  const selectMode = async (label: string, version = 'v2') => {
    await act(async () => tab(label, version).click());
    await ready(version);
  };

  it('shows two JSON tabs and all four stream/detail combinations in text mode without dropdowns', async () => {
    expect(card().querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(card().querySelector('select')).toBeNull();
    expect(JSON.parse(code()).choices[0].message.content).toContain('新海诚');
    await selectMode('stream=false, detail=true');
    expect(JSON.parse(code())).toHaveProperty('responseData');
    await format('text/event-stream');
    expect(card().querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(card().querySelector('select')).toBeNull();
    expect(tab('stream=true, detail=false').getAttribute('aria-selected')).toBe('true');
    await selectMode('stream=false, detail=false');
    expect(JSON.parse(code())).not.toHaveProperty('responseData');
    await selectMode('stream=false, detail=true');
    expect(JSON.parse(code())).toHaveProperty('responseData');
    await selectMode('stream=true, detail=false');
    expect(code()).toContain('data: [DONE]');
    expect(code()).not.toContain('event:');
    await selectMode('stream=true, detail=true');
    expect(code()).toContain('event: flowNodeResponse');
    expect(code()).not.toContain('event: flowResponses\n');
    expect(JSON.parse(code('v1'))).not.toHaveProperty('responseData');
    await format('application/json');
    expect(card().querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(JSON.parse(code())).not.toHaveProperty('responseData');
    expect(card().querySelector('input[aria-label="显示 Schema"]')).not.toBeNull();
  });

  it('uses Scalar code rendering and native copy controls with single-line tab labels', async () => {
    expect(card().querySelector('.scalar-code-block')).not.toBeNull();
    expect(card().querySelector('.scalar-code-copy')).not.toBeNull();
    expect(card().querySelector('.hljs-attr')).not.toBeNull();
    for (const element of card().querySelectorAll('[role="tab"]')) {
      expect(element.textContent).toMatch(/^stream=false, detail=(false|true)$/);
      expect(element.querySelector('br')).toBeNull();
    }
  });

  it('offers the v1 aggregation event and keeps operations independent', async () => {
    await format('text/event-stream', 'v1');
    await selectMode('stream=true, detail=true', 'v1');
    expect(code('v1')).toContain('event: flowResponses');
    expect(code('v1')).not.toContain('event: flowNodeResponse');
    expect(JSON.parse(code())).not.toHaveProperty('responseData');
  });

  it('mounts later cards once, replaces removed portals and ignores unrelated responses', async () => {
    await act(async () => {
      wrapper.innerHTML =
        '<section id="api-1/tag/其他/POST/other"><div class="examples"><div class="response-card"></div></div></section>';
    });
    expect(wrapper.querySelector('[role="tablist"]')).toBeNull();
    await act(async () => {
      wrapper.insertAdjacentHTML('beforeend', operation('v2', 'text/event-stream'));
    });
    await ready();
    expect(card().querySelectorAll('[role="tablist"]')).toHaveLength(1);
    expect(card().querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(code()).toContain('data: [DONE]');
    await act(async () => {
      wrapper.append(document.createElement('div'));
    });
    expect(card().querySelectorAll('[role="tablist"]')).toHaveLength(1);
  });

  it('ignores other status MIME controls and retains the format while its selector is absent', async () => {
    const operationDetails = card().closest('section')!.querySelector('.operation-details')!;
    await act(async () => {
      operationDetails.insertAdjacentHTML(
        'afterbegin',
        '<li class="parameter-item"><span class="parameter-item-name">400</span><button aria-haspopup="listbox"><span>text/event-stream</span></button></li>'
      );
    });
    expect(card().querySelectorAll('[role="tab"]')).toHaveLength(2);
    await format('text/event-stream');
    await act(async () => {
      operationDetails.querySelector('[data-content-type]')!.parentElement!.remove();
    });
    expect(card().querySelectorAll('[role="tab"]')).toHaveLength(4);
    expect(code()).toContain('data: [DONE]');
  });
});

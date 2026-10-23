import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionResponseExamples } from '@/pageComponents/apidoc/CompletionResponseExamples';

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

  beforeEach(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
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
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    wrapper.remove();
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const card = (version = 'v2') =>
    wrapper.querySelector<HTMLElement>(`[data-version="${version}"]`)!;
  const code = (version = 'v2') => card(version).querySelector('pre')!.textContent!;
  const format = async (value: string, version = 'v2') => {
    const label = card(version).closest('section')!.querySelector('[data-content-type]')!;
    // Vue 会原地更新文本节点；只有监听 characterData 才能捕获这种格式切换。
    await act(async () => {
      label.firstChild!.textContent = value;
    });
  };
  const tab = (label: string, version = 'v2') =>
    card(version).querySelector<HTMLButtonElement>(`[role="tab"][aria-label="${label}"]`)!;
  const selectMode = async (label: string, version = 'v2') =>
    act(async () => tab(label, version).click());

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

  it('supports keyboard selection with wrapping, Home/End and an associated tabpanel', async () => {
    await format('text/event-stream');
    const press = async (label: string, key: string) =>
      act(async () => {
        tab(label).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
      });
    await press('stream=true, detail=false', 'End');
    expect(document.activeElement).toBe(tab('stream=true, detail=true'));
    await press('stream=true, detail=true', 'ArrowRight');
    expect(document.activeElement).toBe(tab('stream=false, detail=false'));
    await press('stream=false, detail=false', 'ArrowLeft');
    expect(document.activeElement).toBe(tab('stream=true, detail=true'));
    await press('stream=true, detail=true', 'Home');
    await press('stream=false, detail=false', 'Enter');
    await press('stream=false, detail=false', 'ArrowRight');
    expect(document.activeElement).toBe(tab('stream=false, detail=true'));
    expect(card().querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
    expect(card().querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(
      tab('stream=false, detail=true').id
    );
    expect(JSON.parse(code())).toHaveProperty('responseData');
  });

  it('offers the v1 aggregation event and keeps operations independent', async () => {
    await format('text/event-stream', 'v1');
    await selectMode('stream=true, detail=true', 'v1');
    expect(code('v1')).toContain('event: flowResponses');
    expect(code('v1')).not.toContain('event: flowNodeResponse');
    expect(JSON.parse(code())).not.toHaveProperty('responseData');
  });

  it('copies the visible example, clears status on tab/format changes and reports clipboard errors', async () => {
    const copy = () => card().querySelector<HTMLButtonElement>('[aria-label="复制响应示例"]')!;
    await format('text/event-stream');
    await act(async () => copy().click());
    expect(writeText).toHaveBeenLastCalledWith(code());
    expect(card().querySelector('[role="status"]')!.textContent).toBe('已复制');
    await selectMode('stream=true, detail=true');
    expect(card().querySelector('[role="status"]')!.textContent).toBe('');
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => copy().click());
    expect(card().querySelector('[role="status"]')!.textContent).toContain('复制失败');
    await format('application/json');
    expect(card().querySelector('[role="status"]')!.textContent).toBe('');
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

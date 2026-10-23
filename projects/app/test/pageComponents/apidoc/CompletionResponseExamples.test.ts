import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionResponseExamples } from '@/pageComponents/apidoc/CompletionResponseExamples';

/** 模拟 Scalar 的延迟 operation/响应卡片，测试真实 portal 挂载，不依赖 Vue 运行时。 */
const operation = (version: 'v1' | 'v2') => `
<section id="api-1/tag/会话操作/POST/${version}/chat/completions">
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
  const select = async (label: string, value: string, version = 'v2') => {
    const input = card(version).querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    await act(async () => {
      input.value = value;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  it('switches all stream/detail combinations and keeps each operation independent', async () => {
    expect(JSON.parse(code()).choices[0].message.content).toContain('新海诚');
    await select('detail', 'true');
    expect(JSON.parse(code())).toHaveProperty('responseData');
    await select('stream', 'true');
    expect(code()).toContain('event: flowNodeResponse');
    expect(code()).not.toContain('event: flowResponses\n');
    await select('detail', 'false');
    expect(code()).toContain('data: [DONE]');
    expect(code()).not.toContain('event:');
    expect(JSON.parse(code('v1'))).not.toHaveProperty('responseData');
    expect(card().querySelector('input[aria-label="显示 Schema"]')).not.toBeNull();
  });

  it('switches interaction scenarios and individual events without exposing runtime fields', async () => {
    await select('detail', 'true');
    await select('响应示例场景', 'interactiveUserInput');
    expect(JSON.parse(code()).choices[0].message.content[0].interactive.type).toBe('userInput');
    await select('stream', 'true');
    await select('响应示例场景', 'interactiveUserInput');
    await select('SSE event', 'interactive');
    expect(code()).toContain('"type":"userInput"');
    expect(code()).not.toContain('[DONE]');
    expect(code()).not.toContain('entryNodeIds');
    await select('SSE event', 'toolCall');
    expect(code()).toContain('event: toolCall');
    expect(code()).toContain('"tool"');
    await select('detail', 'false');
    expect(card().querySelector('select[aria-label="SSE event"]')).toBeNull();
    expect(code()).not.toContain('interactive');
  });

  it('offers v1 response aggregation rather than the v2 per-node event', async () => {
    await select('stream', 'true', 'v1');
    await select('detail', 'true', 'v1');
    expect(code('v1')).toContain('event: flowResponses');
    expect(card('v1').querySelector('option[value="flowNodeResponse"]')).toBeNull();
  });

  it('copies the visible example and reports clipboard errors', async () => {
    await select('stream', 'true');
    await select('detail', 'true');
    await select('SSE event', 'error');
    await act(async () =>
      card().querySelector<HTMLButtonElement>('[aria-label="复制响应示例"]')!.click()
    );
    expect(writeText).toHaveBeenLastCalledWith(code());
    expect(card().querySelector('[role="status"]')!.textContent).toBe('已复制');
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () =>
      card().querySelector<HTMLButtonElement>('[aria-label="复制响应示例"]')!.click()
    );
    expect(card().querySelector('[role="status"]')!.textContent).toContain('复制失败');
  });

  it('mounts later cards once, replaces removed portals and ignores unrelated responses', async () => {
    await act(async () => {
      wrapper.innerHTML =
        '<section id="api-1/tag/其他/POST/other"><div class="examples"><div class="response-card"></div></div></section>';
      await Promise.resolve();
    });
    expect(wrapper.querySelector('select')).toBeNull();
    await act(async () => {
      wrapper.insertAdjacentHTML('beforeend', operation('v2'));
      await Promise.resolve();
    });
    expect(card().querySelectorAll('select[aria-label="stream"]')).toHaveLength(1);
    await act(async () => {
      wrapper.append(document.createElement('div'));
      await Promise.resolve();
    });
    expect(card().querySelectorAll('select[aria-label="stream"]')).toHaveLength(1);
  });
});

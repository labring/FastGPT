import { getChatCompletionResponseExamples } from '@fastgpt/global/openapi/core/chat/completion/examples';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompletionEventExamples } from '@/pageComponents/apidoc/CompletionEventExamples';

/** 保留 Scalar 响应说明的层级，验证 portal 在左侧 SSE 说明下挂载。 */
const operation = (version: 'v1' | 'v2') => `
<section id="api-1/tag/会话操作/POST/${version}/chat/completions" data-version="${version}">
  <div class="operation-details"><div class="parameter-item-container"><div class="property">
    <div class="property-description">工作流 SSE 事件流；最后以 [DONE] 结束</div>
  </div></div></div>
  <div class="examples"><div class="response-card">原生响应示例</div></div>
</section>`;

describe('CompletionEventExamples', () => {
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
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    writeText.mockReset().mockResolvedValue(undefined);
    wrapper = document.createElement('div');
    container = document.createElement('div');
    document.body.append(wrapper, container);
    wrapper.innerHTML = operation('v1') + operation('v2');
    root = createRoot(container);
    await act(async () =>
      root.render(React.createElement(CompletionEventExamples, { rootRef: { current: wrapper } }))
    );
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    wrapper.remove();
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  const section = (version = 'v2') =>
    wrapper.querySelector<HTMLElement>(`[data-version="${version}"]`)!;
  const code = (version = 'v2') => section(version).querySelector('pre')!.textContent!;
  const tab = (name: string, version = 'v2') =>
    [...section(version).querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
      (element) => element.textContent === name
    )!;

  it('mounts under the SSE description, switches every event and respects v1/v2 differences', async () => {
    const description = section().querySelector('.property-description')!;
    expect(description.nextElementSibling?.querySelector('[role="tablist"]')).not.toBeNull();
    expect(section().querySelector('.response-card')!.textContent).toBe('原生响应示例');
    expect(section().querySelectorAll('[role="tab"]')).toHaveLength(16);
    for (const event of getChatCompletionResponseExamples('v2').events) {
      await act(async () => tab(event.name).click());
      expect(code()).toBe(event.value);
      expect(tab(event.name).getAttribute('aria-selected')).toBe('true');
      expect(section().querySelector('[role="tabpanel"]')!.getAttribute('aria-labelledby')).toBe(
        tab(event.name).id
      );
    }
    await act(async () => tab('flowResponses', 'v1').click());
    expect(code('v1')).toContain('event: flowResponses\n');
    expect(tab('flowNodeResponse', 'v1')).toBeUndefined();
    expect(code()).toContain('event: error\n');
  });

  it('supports keyboard selection with wrapping, Home and End', async () => {
    const press = async (name: string, key: string) =>
      act(async () => {
        tab(name).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
      });
    await press('answer', 'ArrowLeft');
    expect(document.activeElement).toBe(tab('error'));
    await press('error', 'ArrowRight');
    expect(document.activeElement).toBe(tab('answer'));
    await press('answer', 'End');
    expect(document.activeElement).toBe(tab('error'));
    await press('error', 'Home');
    await press('answer', 'Enter');
    expect(document.activeElement).toBe(tab('answer'));
    expect(section().querySelectorAll('[role="tab"][tabindex="0"]')).toHaveLength(1);
    expect(code()).toContain('event: answer\n');
  });

  it('copies the selected raw SSE example and handles clipboard errors', async () => {
    const copy = () =>
      section().querySelector<HTMLButtonElement>('[aria-label="复制 event 示例"]')!;
    await act(async () => tab('interactive').click());
    await act(async () => copy().click());
    expect(writeText).toHaveBeenLastCalledWith(code());
    expect(section().querySelector('[role="status"]')!.textContent).toBe('已复制');
    await act(async () => tab('toolCall').click());
    expect(section().querySelector('[role="status"]')!.textContent).toBe('');
    writeText.mockRejectedValueOnce(new Error('denied'));
    await act(async () => copy().click());
    expect(section().querySelector('[role="status"]')!.textContent).toContain('复制失败');
  });

  it('removes JSON/collapsed responses, remounts delayed SSE content once and ignores other APIs', async () => {
    const description = section().querySelector('.property-description')!;
    await act(async () => {
      description.textContent = '非流式 JSON 响应';
    });
    expect(section().querySelector('[role="tablist"]')).toBeNull();
    await act(async () => {
      description.textContent = '工作流 SSE 事件流';
    });
    expect(section().querySelectorAll('[role="tablist"]')).toHaveLength(1);
    await act(async () => {
      // Scalar 重建说明旁的节点时，应替换旧 host，而不是重复挂载。
      description.after(document.createElement('div'));
    });
    expect(section().querySelectorAll('[role="tablist"]')).toHaveLength(1);
    await act(async () => {
      wrapper.innerHTML = operation('v2').replace('/v2/chat/completions', '/other');
    });
    expect(wrapper.querySelector('[role="tablist"]')).toBeNull();
    await act(async () => {
      wrapper.innerHTML = operation('v2');
    });
    expect(section().querySelectorAll('[role="tablist"]')).toHaveLength(1);
    await act(async () => {
      section().querySelector('.parameter-item-container')!.remove();
    });
    expect(wrapper.querySelector('[role="tablist"]')).toBeNull();
  });
});

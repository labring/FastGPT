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
  const options = (version = 'v2') =>
    [...section(version).querySelectorAll('option')].map((option) => option.value);
  const select = async (name: string, version = 'v2') => {
    const input = section(version).querySelector('select')!;
    await act(async () => {
      input.value = name;
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  };

  it('mounts under the SSE description, switches every event and respects v1/v2 differences', async () => {
    const description = section().querySelector('.property-description')!;
    expect(description.nextElementSibling?.querySelector('select')).not.toBeNull();
    expect(section().querySelector('.response-card')!.textContent).toBe('原生响应示例');
    expect(section().querySelectorAll('[role="tab"]')).toHaveLength(0);
    expect(options()).toHaveLength(16);
    expect(options()).toContain('flowNodeResponse');
    expect(options()).not.toContain('flowResponses');
    expect(options('v1')).toContain('flowResponses');
    expect(options('v1')).not.toContain('flowNodeResponse');
    expect(section().querySelector('h4')!.textContent).toContain('v2');
    expect(section('v1').querySelector('h4')!.textContent).toContain('v1');
    for (const event of getChatCompletionResponseExamples('v2').events) {
      await select(event.name);
      expect(code().match(/^(event|data):.*$/gm)).toEqual(event.value.match(/^(event|data):.*$/gm));
      expect(code()).not.toMatch(/^: /m);
      if (event.name === 'fastAnswer') {
        expect(code()).toMatch(/^1\. 指定回复文本\n/);
        expect(code()).toContain('\n2. 指定回复停止片段\n');
      }
      expect(section().querySelector('select')!.value).toBe(event.name);
      expect(section().textContent).toContain(event.description);
    }
    await select('flowResponses', 'v1');
    expect(code('v1')).toContain('event: flowResponses\n');
    expect(code()).toContain('event: error\n');
  });

  it('copies the selected raw SSE example and handles clipboard errors', async () => {
    const copy = () =>
      section().querySelector<HTMLButtonElement>('[aria-label="复制 event 示例"]')!;
    await select('interactive');
    await act(async () => copy().click());
    const rawExample = getChatCompletionResponseExamples('v2').events.find(
      (event) => event.name === 'interactive'
    )!.value;
    expect(writeText).toHaveBeenLastCalledWith(rawExample);
    expect(rawExample).toMatch(/^: 1\. 用户选择/);
    expect(section().querySelector('[role="status"]')!.textContent).toBe('已复制');
    await select('toolCall');
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
    expect(section().querySelector('select')).toBeNull();
    await act(async () => {
      description.textContent = '工作流 SSE 事件流';
    });
    expect(section().querySelectorAll('select')).toHaveLength(1);
    await act(async () => {
      // Scalar 重建说明旁的节点时，应替换旧 host，而不是重复挂载。
      description.after(document.createElement('div'));
    });
    expect(section().querySelectorAll('select')).toHaveLength(1);
    await act(async () => {
      wrapper.innerHTML = operation('v2').replace('/v2/chat/completions', '/other');
    });
    expect(wrapper.querySelector('select')).toBeNull();
    await act(async () => {
      wrapper.innerHTML = operation('v2');
    });
    expect(section().querySelectorAll('select')).toHaveLength(1);
    await act(async () => {
      section().querySelector('.parameter-item-container')!.remove();
    });
    expect(wrapper.querySelector('select')).toBeNull();
  });
});

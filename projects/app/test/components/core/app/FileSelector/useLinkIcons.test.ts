import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileSelectorLinkIcons } from '@/components/core/app/FileSelector/useLinkIcons';
import type { FileSelectorRenderItemType } from '@/components/core/app/FileSelector/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

class MockXHR {
  status = 200;
  timeout = 0;
  withCredentials = false;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  headers = new Map<string, string>();
  static instances: MockXHR[] = [];
  static onSend?: (xhr: MockXHR) => void;

  constructor() {
    MockXHR.instances.push(this);
  }

  open(_method: string, _url: string) {}

  getResponseHeader(key: string) {
    return this.headers.get(key.toLowerCase()) ?? null;
  }

  send() {
    if (MockXHR.onSend) {
      MockXHR.onSend(this);
      return;
    }
    queueMicrotask(() => {
      this.onload?.();
    });
  }

  abort() {
    this.onabort?.();
  }
}

describe('useFileSelectorLinkIcons', () => {
  let root: Root;
  let dom: JSDOM;
  let container: HTMLDivElement;
  let icons: ReturnType<typeof useFileSelectorLinkIcons>;
  const file: FileSelectorRenderItemType = {
    id: 'link-1',
    name: 'https://example.com/opaque',
    url: 'https://example.com/opaque',
    type: ChatFileTypeEnum.file
  };

  const Harness = ({ files }: { files: FileSelectorRenderItemType[] }) => {
    icons = useFileSelectorLinkIcons(files);
    return null;
  };
  const render = async (files: FileSelectorRenderItemType[]) => {
    await act(async () => root.render(createElement(Harness, { files })));
  };

  beforeEach(() => {
    MockXHR.instances = [];
    MockXHR.onSend = undefined;
    vi.stubGlobal('XMLHttpRequest', MockXHR);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    container = dom.window.document.createElement('div');
    dom.window.document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('外链只探测一次，结果仅在渲染态保存，不改变文件类型或清洗值', async () => {
    let currentXhr: MockXHR | undefined;
    MockXHR.onSend = (xhr) => {
      currentXhr = xhr;
      xhr.headers.set('content-type', 'audio/wav');
    };
    await render([file]);
    await render([{ ...file }]);
    expect(MockXHR.instances.length).toBe(1);
    await act(async () => {
      currentXhr?.onload?.();
    });
    expect(icons.get(file.id)).toEqual({ url: file.url, icon: 'file/fill/audio' });
    expect(file.type).toBe(ChatFileTypeEnum.file);
    expect(file).not.toHaveProperty('icon');
    await render([{ ...file }]);
    expect(MockXHR.instances.length).toBe(1);
  });

  it('删除条目中止请求，迟到响应不会恢复已删除图标', async () => {
    let currentXhr: MockXHR | undefined;
    let aborted = false;
    MockXHR.onSend = (xhr) => {
      currentXhr = xhr;
      const orig = xhr.abort.bind(xhr);
      xhr.abort = () => {
        aborted = true;
        orig();
      };
      xhr.headers.set('content-type', 'audio/wav');
    };
    await render([file]);
    await render([]);
    expect(aborted).toBe(true);
    await act(async () => {
      currentXhr?.onload?.();
    });
    expect(icons.size).toBe(0);
  });

  it('同一 id 更换 URL 时取消旧请求，旧响应不覆盖新图标', async () => {
    const xhrs: MockXHR[] = [];
    MockXHR.onSend = (xhr) => {
      xhrs.push(xhr);
    };
    await render([file]);
    const updated = { ...file, url: 'https://example.com/updated' };
    await render([updated]);
    expect(xhrs.length).toBe(2);
    xhrs[1].headers.set('content-type', 'video/mp4');
    xhrs[0].headers.set('content-type', 'audio/wav');
    await act(async () => {
      xhrs[1].onload?.();
      xhrs[0].onload?.();
    });
    expect(icons.get(file.id)).toEqual({ url: updated.url, icon: 'file/fill/video' });
  });

  it('私有 key 文件不探测，卸载时中止外链请求', async () => {
    await render([{ ...file, key: 'chat/file.wav' }]);
    expect(MockXHR.instances.length).toBe(0);
    let aborted = false;
    MockXHR.onSend = (xhr) => {
      const orig = xhr.abort.bind(xhr);
      xhr.abort = () => {
        aborted = true;
        orig();
      };
    };
    await render([file]);
    await act(async () => root.unmount());
    expect(aborted).toBe(true);
    root = createRoot(container);
  });

  it('已完成图标随条目删除清理，网络失败不触发重复探测', async () => {
    MockXHR.onSend = (xhr) => {
      xhr.headers.set('content-type', 'audio/wav');
      queueMicrotask(() => xhr.onload?.());
    };
    await render([file]);
    expect(icons.get(file.id)?.icon).toBe('file/fill/audio');
    await render([]);
    expect(icons.size).toBe(0);

    MockXHR.onSend = (xhr) => {
      xhr.status = 405;
      queueMicrotask(() => xhr.onerror?.());
    };
    await render([file]);
    await render([{ ...file }]);
    expect(MockXHR.instances.length).toBe(2);
    expect(icons.size).toBe(0);
  });
});

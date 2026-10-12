import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileSelectorLinkIcons } from '@/components/core/app/FileSelector/useLinkIcons';
import type { FileSelectorRenderItemType } from '@/components/core/app/FileSelector/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';

describe('useFileSelectorLinkIcons', () => {
  const fetchMock = vi.fn<typeof fetch>();
  let requests: { signal: AbortSignal; complete: (response: Response) => void }[];
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
    requests = [];
    fetchMock.mockReset();
    // 故意允许取消后的响应到达，验证真实 hook 和探测函数不会接纳旧结果。
    fetchMock.mockImplementation(
      (_url, options) =>
        new Promise((resolve) => {
          if (!options?.signal) throw new Error('Missing request signal');
          requests.push({ signal: options.signal, complete: resolve });
        })
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    dom = new JSDOM('<!doctype html><html><body></body></html>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    container = dom.window.document.createElement('div');
    dom.window.document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      requests.forEach(({ complete }) => complete(new Response(null)));
    });
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('外链只探测一次，结果仅在渲染态保存，不改变文件类型或清洗值', async () => {
    await render([file]);
    await render([{ ...file }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => {
      requests[0].complete(new Response(null, { headers: { 'Content-Type': 'audio/wav' } }));
    });
    expect(icons.get(file.id)).toEqual({ url: file.url, icon: 'file/fill/audio' });
    expect(file.type).toBe(ChatFileTypeEnum.file);
    expect(file).not.toHaveProperty('icon');
    await render([{ ...file }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('删除条目中止请求，迟到响应不会恢复已删除图标', async () => {
    await render([file]);
    await render([]);
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => {
      requests[0].complete(new Response(null, { headers: { 'Content-Type': 'audio/wav' } }));
    });
    expect(icons.size).toBe(0);
  });

  it('同一 id 更换 URL 时取消旧请求，旧响应不覆盖新图标', async () => {
    await render([file]);
    const updated = { ...file, url: 'https://example.com/updated' };
    await render([updated]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => {
      requests[1].complete(new Response(null, { headers: { 'Content-Type': 'video/mp4' } }));
      requests[0].complete(new Response(null, { headers: { 'Content-Type': 'audio/wav' } }));
    });
    expect(icons.get(file.id)).toEqual({ url: updated.url, icon: 'file/fill/video' });
  });

  it('私有 key 文件不探测，卸载时中止外链请求', async () => {
    await render([{ ...file, key: 'chat/file.wav' }]);
    expect(fetchMock).not.toHaveBeenCalled();
    await render([file]);
    await act(async () => root.unmount());
    expect(requests[0].signal.aborted).toBe(true);
    root = createRoot(container);
  });

  it('已完成图标随条目删除清理，网络失败不触发重复探测', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { headers: { 'Content-Type': 'audio/wav' } })
    );
    await render([file]);
    expect(icons.get(file.id)?.icon).toBe('file/fill/audio');
    await render([]);
    expect(icons.size).toBe(0);

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await render([file]);
    await render([{ ...file }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(icons.size).toBe(0);
  });
});

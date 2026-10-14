import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFieldArray, useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileUpload } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  member: 'member-a',
  presign: vi.fn(),
  upload: vi.fn(),
  abort: vi.fn(),
  toast: vi.fn()
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { tmbId: mocks.member } }, teamPlanStatus: null })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({ feConfigs: { uploadFileMaxAmount: 10, uploadFileMaxSize: 500 } })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/common/file/api', () => ({
  getUploadChatFilePresignedUrl: mocks.presign,
  getUploadDraftChatFilePresignedUrl: mocks.presign
}));
vi.mock('@fastgpt/web/common/file/uploader', () => ({
  S3FileUploader: class {
    upload = mocks.upload;
    abort = mocks.abort;
  }
}));

describe('useFileUpload ownership', () => {
  let dom: JSDOM;
  let root: Root;
  let mounted: boolean;
  let result: ReturnType<typeof useFileUpload>;
  let form: ReturnType<typeof useForm<ChatBoxInputFormType>>;
  const readers: Array<{ result: string; onload?: () => void }> = [];
  const Harness = ({ chatId }: { chatId: string }) => {
    form = useForm<ChatBoxInputFormType>({ defaultValues: { input: '', files: [] } });
    const fileCtrl = useFieldArray({ control: form.control, name: 'files' });
    result = useFileUpload({
      fileCtrl,
      chatId,
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app' },
      fileSelectConfig: { canSelectFile: true, canSelectImg: true }
    });
    return null;
  };
  const render = async (chatId = 'A') => {
    await act(async () => root.render(React.createElement(Harness, { chatId })));
    mounted = true;
  };
  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'FileReader',
      class {
        result = 'data:image/png;base64,preview';
        onload?: () => void;
        readAsDataURL() {
          readers.push(this);
        }
      }
    );
    readers.length = 0;
    mocks.member = 'member-a';
    vi.clearAllMocks();
    mocks.presign.mockResolvedValue({ key: 'chat/file.pdf', previewUrl: 'https://preview' });
    mocks.upload.mockResolvedValue(undefined);
    mocks.abort.mockResolvedValue(undefined);
    root = createRoot(document.getElementById('root')!);
    mounted = false;
  });
  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it.each(['chat', 'member', 'unmount'] as const)(
    'ignores FileReader completion after %s changes',
    async (change) => {
      await render();
      let selected: Promise<unknown> = Promise.resolve();
      await act(async () => {
        selected = result.onSelectFile({
          files: [new dom.window.File(['image'], 'image.png', { type: 'image/png' })]
        });
      });
      expect(readers).toHaveLength(1);
      if (change === 'unmount') {
        await act(async () => root.unmount());
        mounted = false;
      } else {
        if (change === 'member') mocks.member = 'member-b';
        await render(change === 'chat' ? 'B' : 'A');
      }
      await act(async () => {
        readers[0].onload?.();
        await selected;
      });
      expect(form.getValues('files')).toEqual([]);
    }
  );

  it('cancels a previous upload and ignores a late presign result in the new conversation', async () => {
    await render();
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['text'], 'file.pdf', { type: 'application/pdf' })]
      })
    );
    let resolve: (value: unknown) => void = () => {};
    mocks.presign.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      })
    );
    let uploading: Promise<unknown> = Promise.resolve();
    await act(async () => {
      uploading = result.uploadFiles();
    });
    const controller = mocks.presign.mock.calls[0][1].cancelToken as AbortController;
    await render('B');
    expect(controller.signal.aborted).toBe(true);
    await act(async () => result.clearFiles());
    await act(async () => {
      resolve({ key: 'chat/old.pdf', previewUrl: 'https://late' });
      await uploading;
    });
    expect(form.getValues('files')).toEqual([]);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(mocks.toast).not.toHaveBeenCalled();
  });
});

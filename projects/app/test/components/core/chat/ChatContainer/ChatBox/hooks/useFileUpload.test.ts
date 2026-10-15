import { JSDOM } from 'jsdom';
import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFieldArray, useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFileUpload } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { S3FileUploaderParams } from '@fastgpt/web/common/file/uploader/types';

const mocks = vi.hoisted(() => ({
  member: 'member-a',
  presign: vi.fn(),
  upload: vi.fn(),
  abort: vi.fn(),
  uploadParams: [] as S3FileUploaderParams[],
  toast: vi.fn()
}));
vi.mock('@/web/support/user/useUserStore', () => ({
  useUserStore: () => ({ userInfo: { team: { tmbId: mocks.member } }, teamPlanStatus: null })
}));
vi.mock('@/web/common/system/useSystemStore', () => ({
  useSystemStore: () => ({
    feConfigs: { limit: { uploadFileMaxAmount: 10, uploadFileMaxSize: 500 } }
  })
}));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/common/file/api', () => ({
  getUploadChatFilePresignedUrl: mocks.presign,
  getUploadDraftChatFilePresignedUrl: mocks.presign
}));
vi.mock('@fastgpt/web/common/file/uploader', () => ({
  S3FileUploader: class {
    constructor(params: S3FileUploaderParams) {
      mocks.uploadParams.push(params);
    }
    upload = mocks.upload;
    abort = mocks.abort;
  }
}));

describe('useFileUpload', () => {
  let dom: JSDOM;
  let root: Root;
  let mounted: boolean;
  let result: ReturnType<typeof useFileUpload>;
  let form: ReturnType<typeof useForm<ChatBoxInputFormType>>;
  const readers: Array<{
    result: string;
    error?: Error;
    onload: (() => void) | null;
    onerror: (() => void) | null;
    onabort: (() => void) | null;
    abort: ReturnType<typeof vi.fn>;
  }> = [];
  const Harness = ({ chatId, autoUpload = false }: { chatId: string; autoUpload?: boolean }) => {
    form = useForm<ChatBoxInputFormType>({ defaultValues: { input: '', files: [] } });
    const fileCtrl = useFieldArray({ control: form.control, name: 'files' });
    const upload = useFileUpload({
      fileCtrl,
      getValues: form.getValues,
      chatId,
      sourceTarget: { sourceType: ChatSourceTypeEnum.app, sourceId: 'app' },
      fileSelectConfig: { canSelectFile: true, canSelectImg: true }
    });
    result = upload;
    const { uploadFiles } = upload;
    useEffect(() => {
      if (autoUpload) void uploadFiles();
    }, [autoUpload, uploadFiles, fileCtrl.fields]);
    return null;
  };
  const render = async (chatId = 'A', autoUpload = false) => {
    await act(async () => root.render(React.createElement(Harness, { chatId, autoUpload })));
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
        error?: Error;
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        onabort: (() => void) | null = null;
        abort = vi.fn(() => this.onabort?.());
        readAsDataURL() {
          readers.push(this);
        }
      }
    );
    readers.length = 0;
    mocks.uploadParams.length = 0;
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

  it.each(['chat round trip', 'member', 'unmount', 'clear'] as const)(
    'settles pending reads and ignores late completion after %s',
    async (change) => {
      await render();
      let selected: Promise<unknown> = Promise.resolve();
      await act(async () => {
        selected = result.onSelectFile({
          files: [new dom.window.File(['image'], 'image.png', { type: 'image/png' })]
        });
      });
      expect(readers).toHaveLength(1);
      const lateLoad = readers[0].onload;
      if (change === 'unmount') {
        await act(async () => root.unmount());
        mounted = false;
      } else if (change === 'clear') {
        await act(async () => result.clearFiles());
      } else {
        if (change === 'member') mocks.member = 'member-b';
        await render(change === 'chat round trip' ? 'B' : 'A');
        expect(form.getValues('files')).toEqual([]);
        if (change === 'chat round trip') await render('A');
      }
      expect(readers[0].abort).toHaveBeenCalledOnce();
      await act(async () => {
        expect(await selected).toEqual([]);
        lateLoad?.();
      });
      expect(form.getValues('files')).toEqual([]);
      expect(mocks.presign).not.toHaveBeenCalled();
    }
  );

  it('cancels queued selections on switch even before the field array renders them', async () => {
    await render();
    let selected: Promise<unknown> = Promise.resolve();
    await act(async () => {
      selected = result.onSelectFile({
        files: [new dom.window.File(['text'], 'queued.pdf', { type: 'application/pdf' })]
      });
      root.render(React.createElement(Harness, { chatId: 'B' }));
    });
    await selected;
    expect(form.getValues('files')).toEqual([]);
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it('aborts an in-flight upload and removes queued files while retaining completed attachments', async () => {
    await render();
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['done'], 'done.pdf', { type: 'application/pdf' })]
      })
    );
    await act(async () => result.uploadFiles());
    const completed = form.getValues('files')[0];

    const upload = Promise.withResolvers<void>();
    mocks.upload.mockReturnValueOnce(upload.promise);
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['pending'], 'pending.pdf', { type: 'application/pdf' })]
      })
    );
    let uploading: Promise<unknown> = Promise.resolve();
    await act(async () => {
      uploading = result.uploadFiles();
    });
    const oldUpload = mocks.uploadParams[1];
    expect(mocks.presign.mock.calls[1][0].chatId).toBe('A');
    await act(async () => {
      oldUpload.onProgress?.(50, 100);
      oldUpload.onProgress?.(1, 0);
    });
    expect(form.getValues('files')[1].process).toBe(50);
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['queued'], 'queued.pdf', { type: 'application/pdf' })]
      })
    );
    expect(form.getValues('files')).toHaveLength(3);

    await render('B');
    expect(oldUpload.signal?.aborted).toBe(true);
    expect(form.getValues('files')).toEqual([completed]);
    await render('A');
    await act(async () => {
      oldUpload.onProgress?.(100, 100);
      upload.resolve();
      await uploading;
    });
    expect(form.getValues('files')).toEqual([completed]);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('does not remove an attachment already restored for the next conversation', async () => {
    await render();
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['old'], 'old.pdf', { type: 'application/pdf' })]
      })
    );
    const restored = {
      id: 'new-file',
      uploadId: 'new-upload',
      key: 'chat/restored.pdf',
      url: 'https://restored',
      name: 'restored.pdf',
      type: 'file' as const,
      icon: 'icon',
      status: 1 as const
    };
    await act(async () => {
      form.setValue('files', [restored]);
      root.render(React.createElement(Harness, { chatId: 'B' }));
    });
    expect(form.getValues('files')).toEqual([restored]);
  });

  it('does not reassign an old pending file when automatic upload runs during a conversation switch', async () => {
    const presign = Promise.withResolvers<{ key: string; previewUrl: string }>();
    mocks.presign.mockReturnValueOnce(presign.promise);
    await render('A', true);
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['old'], 'old.pdf', { type: 'application/pdf' })]
      })
    );
    const oldController = mocks.presign.mock.calls[0][1].cancelToken as AbortController;
    expect(mocks.presign.mock.calls[0][0].chatId).toBe('A');

    await render('B', true);
    expect(oldController.signal.aborted).toBe(true);
    expect(form.getValues('files')).toEqual([]);
    expect(mocks.presign).toHaveBeenCalledOnce();
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['new'], 'new.pdf', { type: 'application/pdf' })]
      })
    );
    expect(mocks.presign).toHaveBeenCalledTimes(2);
    expect(mocks.presign.mock.calls[1][0].chatId).toBe('B');

    await act(async () => {
      presign.resolve({ key: 'chat/old.pdf', previewUrl: 'https://old' });
    });
    expect(form.getValues('files').map((file) => file.name)).toEqual(['new.pdf']);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.abort).toHaveBeenCalledOnce();
    expect(mocks.uploadParams[0].signal?.aborted).toBe(false);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('uses the native FileReader to prepare and upload an image once', async () => {
    vi.stubGlobal('FileReader', dom.window.FileReader);
    await render();
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['image'], 'image.png', { type: 'image/png' })]
      })
    );
    expect(form.getValues('files')[0].icon).toBe('data:image/png;base64,aW1hZ2U=');
    await act(async () => Promise.all([result.uploadFiles(), result.uploadFiles()]));
    expect(mocks.presign).toHaveBeenCalledOnce();
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(form.getValues('files')[0].url).toBe('https://preview');
  });

  it('cleans up the selection batch if reading one preview fails', async () => {
    await render();
    let selected: Promise<unknown> = Promise.resolve();
    await act(async () => {
      selected = result.onSelectFile({
        files: ['bad.png', 'pending.png'].map(
          (name) => new dom.window.File(['image'], name, { type: 'image/png' })
        )
      });
    });
    const error = new Error('cannot read image');
    await act(async () => {
      readers[0].error = error;
      readers[0].onerror?.();
      await expect(selected).rejects.toBe(error);
    });
    expect(readers[1].abort).toHaveBeenCalledOnce();
    expect(form.getValues('files')).toEqual([]);
    expect(mocks.presign).not.toHaveBeenCalled();
  });

  it('removes queued and completed files by upload ID and releases their selection slots', async () => {
    await render();
    const files = Array.from(
      { length: 11 },
      (_, index) => new dom.window.File(['text'], `${index}.pdf`, { type: 'application/pdf' })
    );
    await act(async () => result.onSelectFile({ files }));
    expect(form.getValues('files')).toHaveLength(10);
    await act(async () => result.onSelectFile({ files: [files[10]] }));
    expect(form.getValues('files')).toHaveLength(10);

    const queuedId = form.getValues('files')[0].uploadId!;
    await act(async () => result.cancelUploadFile(queuedId));
    expect(form.getValues('files')).toHaveLength(9);
    await act(async () => result.onSelectFile({ files: [files[10]] }));
    expect(form.getValues('files')).toHaveLength(10);
    await act(async () => result.uploadFiles());
    const completedId = form.getValues('files')[0].uploadId!;
    await act(async () => result.cancelUploadFile(completedId));
    await act(async () => result.cancelUploadFile('missing-upload'));
    expect(form.getValues('files')).toHaveLength(9);
    expect(form.getValues('files').some((file) => file.uploadId === completedId)).toBe(false);
  });

  it('removes a failed upload from the live form and reports the error', async () => {
    await render();
    await act(async () =>
      result.onSelectFile({
        files: [new dom.window.File(['text'], 'failed.pdf', { type: 'application/pdf' })]
      })
    );
    mocks.upload.mockRejectedValueOnce(new Error('cannot upload file'));
    await act(async () => result.uploadFiles());
    expect(form.getValues('files')).toEqual([]);
    expect(mocks.toast).toHaveBeenCalledOnce();
  });

  it('does not register uploads for empty, Office lock or oversized files', async () => {
    await render();
    expect(await result.onSelectFile({ files: [] })).toEqual([]);
    await act(async () =>
      result.onSelectFile({
        files: [
          new dom.window.File([], 'empty.pdf', { type: 'application/pdf' }),
          new dom.window.File(['lock'], '~$draft.docx')
        ]
      })
    );
    const oversized = new dom.window.File(['text'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(oversized, 'size', { value: 501 * 1024 * 1024 });
    await act(async () => result.onSelectFile({ files: [oversized] }));
    await act(async () => result.uploadFiles());
    expect(form.getValues('files')).toEqual([]);
    expect(mocks.presign).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledTimes(3);
  });
});

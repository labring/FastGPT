import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSandboxFileStore } from '@/pageComponents/chat/SandboxEditor/hook';
import type { SandboxUploadResponse } from '@fastgpt/global/openapi/core/ai/sandbox/api';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  uploadFile: vi.fn(),
  preview: vi.fn(),
  listDirectory: vi.fn(),
  move: vi.fn(),
  toast: vi.fn(),
  t: (key: string) => key
}));

vi.mock('@/pageComponents/chat/SandboxEditor/api', () => ({
  readSandboxFile: mocks.readFile,
  uploadSandboxFile: mocks.uploadFile,
  getFilePreviewLink: mocks.preview,
  listSandboxDirectory: mocks.listDirectory,
  checkSandboxExist: vi.fn(),
  deleteSandboxEntry: vi.fn(),
  downloadSandbox: vi.fn(),
  execSandboxCommand: vi.fn(),
  mkdirSandboxDirectory: vi.fn(),
  moveSandboxEntry: mocks.move
}));
vi.mock('@/pageComponents/chat/SandboxEditor/modal', () => ({ default: () => null }));
vi.mock('@chakra-ui/react', () => ({ IconButton: () => null }));
vi.mock('@fastgpt/web/components/common/Icon', () => ({ default: () => null }));
vi.mock('@fastgpt/web/components/common/MyTooltip', () => ({ default: () => null }));
vi.mock('next-i18next', () => ({ useTranslation: () => ({ t: mocks.t }) }));
vi.mock('@fastgpt/web/hooks/useToast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/web/core/chat/context/chatRecordContext', () => ({ ChatRecordContext: {} }));
vi.mock('@/global/core/chat/utils', () => ({ addStatisticalDataToHistoryItem: vi.fn() }));

describe('SandboxEditor file loading and saves', () => {
  const maxEditableBytes = 5 * 1024 * 1024;
  let dom: JSDOM;
  let root: Root;
  let store: ReturnType<typeof useSandboxFileStore>;
  let props: Parameters<typeof useSandboxFileStore>[0];

  const HookTarget = () => {
    store = useSandboxFileStore(props);
    return null;
  };
  const render = async () => {
    await act(async () => root.render(React.createElement(HookTarget)));
  };
  const edit = async (content: string) => {
    await act(async () => {
      store.setOpenedFiles((files) =>
        files.map((file) => ({ ...file, content, isDirty: true, hasSaveError: false }))
      );
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    vi.resetAllMocks();
    const bytes = new TextEncoder().encode('initial text');
    mocks.readFile.mockResolvedValue({ bytes, size: bytes.byteLength, etag: '"v1"' });
    mocks.uploadFile.mockResolvedValue({ path: 'empty.txt', bytesWritten: 0, etag: '"v2"' });
    mocks.listDirectory.mockResolvedValue({ entries: [] });
    mocks.preview.mockResolvedValue({
      url: 'https://fastgpt.example.com/preview/image.png?token=first',
      expiresAt: Date.now() + 2 * 60 * 60 * 1000
    });
    props = {
      sandboxTarget: { appId: 'app-1' },
      chatId: 'chat-1',
      outLinkAuthData: { shareId: 'share-1', outLinkUid: 'visitor-1' },
      isPreparing: true
    };
    dom = new JSDOM('<!doctype html><body></body>');
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('navigator', dom.window.navigator);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('decodes UTF-8 and retains ETag without using stale directory sizes', async () => {
    const content = '你好 🌍\r\n日本語';
    const bytes = new TextEncoder().encode(content);
    mocks.readFile.mockResolvedValue({ bytes, size: bytes.byteLength, etag: '"raw-version"' });
    await render();
    await act(async () => {
      store.setFileTree([
        { name: 'notes.txt', path: 'notes.txt', type: 'file', level: 0, size: maxEditableBytes + 1 }
      ]);
    });
    await act(async () => store.openFile('notes.txt'));

    expect(store.activeFile).toEqual(
      expect.objectContaining({ content, etag: '"raw-version"', readOnly: false, isUnknown: false })
    );
    expect(mocks.readFile).toHaveBeenCalledOnce();
    expect(mocks.preview).not.toHaveBeenCalled();
  });

  it.each([
    { size: maxEditableBytes, readOnly: false },
    { size: maxEditableBytes + 1, readOnly: true }
  ])('sets text readOnly=$readOnly for $size actual bytes', async ({ size, readOnly }) => {
    const bytes = new Uint8Array(size).fill(97);
    mocks.readFile.mockResolvedValue({ bytes, size, etag: '"large-version"' });
    await render();
    await act(async () => {
      store.setFileTree([
        { name: 'large.txt', path: 'large.txt', type: 'file', level: 0, size: 0 }
      ]);
    });
    await act(async () => store.openFile('large.txt'));

    expect(store.activeFile?.content.length).toBe(size);
    expect(store.activeFile?.readOnly).toBe(readOnly);
    expect(store.activeFile?.etag).toBe('"large-version"');
    if (readOnly) {
      await act(async () => store.saveFile());
      expect(mocks.uploadFile).not.toHaveBeenCalled();
    }
  });

  it('keeps malformed UTF-8 in the non-renderable binary fallback and never saves it as text', async () => {
    const bytes = new Uint8Array([0xff, 0xfe, 0x80]);
    mocks.readFile.mockResolvedValue({ bytes, size: bytes.byteLength, etag: '"binary-version"' });
    await render();
    await act(async () => store.openFile('archive.zip'));
    await act(async () => store.saveFile());

    expect(store.activeFile).toEqual(
      expect.objectContaining({ content: '', isUnknown: true, etag: '"binary-version"' })
    );
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it('uploads UTF-8 snapshots serially and advances ETag while later edits stay dirty', async () => {
    let finishFirst!: (response: SandboxUploadResponse) => void;
    let finishSecond!: (response: SandboxUploadResponse) => void;
    mocks.uploadFile
      .mockImplementationOnce(
        () => new Promise<SandboxUploadResponse>((resolve) => (finishFirst = resolve))
      )
      .mockImplementationOnce(
        () => new Promise<SandboxUploadResponse>((resolve) => (finishSecond = resolve))
      );
    await render();
    await act(async () => store.openFile('notes.txt'));
    const firstContent = '第一版 🌍\r\n';
    await edit(firstContent);
    let firstSave!: Promise<void>;
    await act(async () => {
      firstSave = store.saveFile();
    });
    const firstRequest = mocks.uploadFile.mock.calls[0][0];
    expect(firstRequest.oldEtag).toBe('"v1"');
    expect(firstRequest.file).toBeInstanceOf(Blob);
    expect(await firstRequest.file.text()).toBe(firstContent);

    const secondContent = '第二版 🦊\n';
    await edit(secondContent);
    let secondSave!: Promise<void>;
    await act(async () => {
      secondSave = store.saveFile();
    });
    expect(mocks.uploadFile).toHaveBeenCalledOnce();
    await act(async () => {
      finishFirst({ path: 'notes.txt', bytesWritten: firstRequest.file.size, etag: '"v2"' });
      await firstSave;
    });

    expect(store.activeFile).toEqual(
      expect.objectContaining({ content: secondContent, isDirty: true, etag: '"v2"' })
    );
    const secondRequest = mocks.uploadFile.mock.calls[1][0];
    expect(secondRequest.oldEtag).toBe('"v2"');
    expect(await secondRequest.file.text()).toBe(secondContent);
    await act(async () => {
      finishSecond({ path: 'notes.txt', bytesWritten: secondRequest.file.size, etag: '"v3"' });
      await secondSave;
    });
    expect(store.activeFile).toEqual(
      expect.objectContaining({ content: secondContent, isDirty: false, etag: '"v3"' })
    );
  });

  it('creates an empty file through the same upload API with a zero-byte Blob', async () => {
    await render();
    await act(async () => store.onCreateNode({ parentPath: '.', name: 'empty.txt', type: 'file' }));

    const request = mocks.uploadFile.mock.calls[0][0];
    expect(request).toEqual(expect.objectContaining({ path: 'empty.txt' }));
    expect(request.file).toBeInstanceOf(Blob);
    expect(request.file.size).toBe(0);
    expect(store.activeFile).toEqual(
      expect.objectContaining({ path: 'empty.txt', content: '', etag: '"v2"', isLoading: false })
    );
  });

  it('reuses media preview URLs across reopen and refresh, then renews near expiry', async () => {
    await render();
    await act(async () => store.openFile('image.png'));
    const firstUrl = store.activeFile?.content;
    await act(async () => store.closeFile('image.png'));
    await act(async () => store.openFile('image.png'));
    await act(async () => store.refreshWorkspace());
    await act(async () => store.refreshWorkspace());

    expect(store.activeFile?.content).toBe(firstUrl);
    expect(mocks.preview).toHaveBeenCalledOnce();
    expect(mocks.readFile).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000 - 29 * 1000));
    const secondUrl = 'https://fastgpt.example.com/preview/image.png?token=second';
    mocks.preview.mockResolvedValue({ url: secondUrl, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
    await act(async () => store.refreshWorkspace());

    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(store.activeFile?.content).toBe(secondUrl);
    expect(mocks.readFile).not.toHaveBeenCalled();

    mocks.listDirectory.mockResolvedValueOnce({
      entries: [{ name: 'image.png', path: 'image.png', type: 'file', size: 2048, mtime: 999 }]
    });
    await act(async () => store.refreshWorkspace());
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(store.activeFile?.content).toBe(`${secondUrl}&_sandboxVersion=999-2048`);
  });

  it.each([
    { type: 'rename', from: 'image.png', to: 'renamed.png', filePath: 'image.png' },
    { type: 'rename', from: 'assets', to: 'renamed', filePath: 'assets/image.png' },
    { type: 'move', from: 'assets', to: 'target/assets', filePath: 'assets/image.png' }
  ])('reloads media URLs after $type from $from to $to', async ({ type, from, to, filePath }) => {
    mocks.preview.mockImplementation(async ({ filePath }: { filePath: string }) => ({
      url: `https://fastgpt.example.com/preview/${filePath}?token=${mocks.preview.mock.calls.length}`,
      expiresAt: Date.now() + 2 * 60 * 60 * 1000
    }));
    await render();
    await act(async () => {
      store.setFileTree([
        { name: 'image.png', path: 'image.png', type: 'file', level: 0 },
        {
          name: 'assets',
          path: 'assets',
          type: 'directory',
          level: 0,
          children: [{ name: 'image.png', path: 'assets/image.png', type: 'file', level: 1 }]
        },
        { name: 'target', path: 'target', type: 'directory', level: 0, children: [] }
      ]);
    });
    await act(async () => store.openFile(filePath));
    const oldUrl = store.activeFile?.content;
    await act(async () => {
      if (type === 'rename') {
        await store.onRenameComplete(from, to);
      } else {
        await store.onMoveFile(from, 'target');
      }
    });

    const movedPath = filePath === from ? to : `${to}/image.png`;
    expect(store.activeFile?.path).toBe(movedPath);
    expect(store.activeFile?.content).toBe(
      `https://fastgpt.example.com/preview/${movedPath}?token=2`
    );
    expect(store.activeFile?.content).not.toBe(oldUrl);
    expect(mocks.readFile).not.toHaveBeenCalled();
    await act(async () => {
      if (type === 'rename') {
        await store.onRenameComplete(to, from);
      } else {
        await store.onMoveFile(to, '.');
      }
    });

    expect(store.activeFile?.path).toBe(filePath);
    expect(store.activeFile?.content).toBe(
      `https://fastgpt.example.com/preview/${filePath}?token=3`
    );
    expect(mocks.preview).toHaveBeenCalledTimes(3);
  });

  it('clears a moved media URL when reissuing fails without rolling back the successful move', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await render();
    await act(async () => store.openFile('image.png'));
    mocks.preview.mockRejectedValueOnce(new Error('Token issuer unavailable'));
    await act(async () => store.onRenameComplete('image.png', 'renamed.png'));

    expect(mocks.move).toHaveBeenCalledOnce();
    expect(store.activeFile).toEqual(
      expect.objectContaining({
        path: 'renamed.png',
        content: '',
        isLoading: false,
        isUnknown: false
      })
    );
    expect(mocks.toast).not.toHaveBeenCalled();
    await act(async () => store.refreshWorkspace());
    expect(store.activeFile?.content).toContain('https://');
    expect(mocks.preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ filePath: 'renamed.png' })
    );
  });

  it.each([
    { sandboxTarget: { skillId: 'skill-1' } },
    { chatId: 'chat-2' },
    { outLinkAuthData: { shareId: 'share-2', outLinkUid: 'visitor-1' } },
    { outLinkAuthData: { shareId: 'share-1', outLinkUid: 'visitor-2' } }
  ])('clears media preview cache when the context changes: %j', async (changes) => {
    await render();
    await act(async () => store.openFile('image.png'));
    await act(async () => store.closeFile('image.png'));
    props = { ...props, ...changes };
    await render();
    await act(async () => store.openFile('image.png'));

    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(mocks.preview).toHaveBeenLastCalledWith({
      ...props.sandboxTarget,
      chatId: props.chatId,
      outLinkAuthData: props.outLinkAuthData,
      filePath: 'image.png'
    });
  });

  it('resets dirty files and drops in-flight operations on chatId switch without cross-chat uploads', async () => {
    let finishChat1Read!: (value: { bytes: Uint8Array; size: number; etag: string }) => void;
    await render();
    await act(async () => store.openFile('notes.txt'));
    await edit('dirty content from chat-1');

    mocks.readFile.mockImplementationOnce(
      () => new Promise((resolve) => (finishChat1Read = resolve))
    );
    let pendingOpen!: Promise<void>;
    await act(async () => {
      pendingOpen = store.openFile('stale.txt');
    });

    props = { ...props, chatId: 'chat-2' };
    await render();

    expect(store.openedFiles).toEqual([]);
    expect(store.activeFilePath).toBe('');
    expect(store.selectedPath).toBe('');

    const staleBytes = new TextEncoder().encode('from chat-1');
    await act(async () => {
      finishChat1Read({ bytes: staleBytes, size: staleBytes.byteLength, etag: '"stale"' });
      await pendingOpen;
    });
    await act(async () => vi.advanceTimersByTimeAsync(1000));

    expect(store.openedFiles).toEqual([]);
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });

  it('keeps open tabs under collapsed folders on transient reload errors and closes only on 404', async () => {
    mocks.listDirectory.mockResolvedValue({
      entries: [{ name: 'src', path: 'src', type: 'directory' }]
    });
    await render();
    await act(async () => store.refreshWorkspace());
    await act(async () => store.openFile('src/index.ts'));
    expect(store.activeFilePath).toBe('src/index.ts');

    mocks.readFile.mockRejectedValueOnce(
      Object.assign(new Error('Gateway timeout'), { status: 502 })
    );
    await act(async () => store.refreshWorkspace({ preserveExpandedDirs: true }));
    expect(store.openedFiles.map((f) => f.path)).toEqual(['src/index.ts']);
    expect(store.activeFilePath).toBe('src/index.ts');

    mocks.readFile.mockRejectedValueOnce(Object.assign(new Error('Read failed'), { status: 404 }));
    await act(async () => store.refreshWorkspace({ preserveExpandedDirs: true }));
    expect(store.openedFiles).toEqual([]);
    expect(store.activeFilePath).toBe('');
  });

  it('marks hasSaveError on save conflict without retrying on tab switch until edited again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await render();
    await act(async () => store.openFile('a.txt'));
    await act(async () => store.openFile('b.txt'));
    await act(async () => store.setActiveFilePath('a.txt'));

    mocks.uploadFile.mockRejectedValueOnce(new Error('ETag conflict'));
    await act(async () => {
      store.setOpenedFiles((files) =>
        files.map((file) =>
          file.path === 'a.txt'
            ? { ...file, content: 'conflicted', isDirty: true, hasSaveError: false }
            : file
        )
      );
    });

    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.uploadFile).toHaveBeenCalledOnce();
    expect(store.openedFiles.find((f) => f.path === 'a.txt')).toEqual(
      expect.objectContaining({
        isDirty: true,
        isSaving: false,
        hasSaveError: true
      })
    );

    // 切换标签页不应重新触发失败文件的自动保存
    await act(async () => store.setActiveFilePath('b.txt'));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    await act(async () => store.setActiveFilePath('a.txt'));
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(mocks.uploadFile).toHaveBeenCalledOnce();

    // 用户再次编辑后恢复防抖保存
    mocks.uploadFile.mockResolvedValueOnce({ path: 'a.txt', bytesWritten: 8, etag: '"v2"' });
    await act(async () => {
      store.setOpenedFiles((files) =>
        files.map((file) =>
          file.path === 'a.txt'
            ? { ...file, content: 'resolved', isDirty: true, hasSaveError: false }
            : file
        )
      );
    });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(mocks.uploadFile).toHaveBeenCalledTimes(2);
    expect(store.openedFiles.find((f) => f.path === 'a.txt')).toEqual(
      expect.objectContaining({
        content: 'resolved',
        isDirty: false,
        isSaving: false,
        hasSaveError: false,
        etag: '"v2"'
      })
    );
  });

  it('ignores internal focus transfers and preserves mid-flight directory expansions', async () => {
    await render();
    const wrapper = document.createElement('div');
    const childButton = document.createElement('button');
    wrapper.appendChild(childButton);

    await act(async () => {
      store.onWorkspaceFocus({
        currentTarget: wrapper,
        relatedTarget: childButton
      } as unknown as React.FocusEvent<HTMLElement>);
    });
    expect(mocks.listDirectory).not.toHaveBeenCalled();

    let finishRootList!: (value: {
      entries: { name: string; path: string; type: 'directory' }[];
    }) => void;
    mocks.listDirectory
      .mockImplementationOnce(() => new Promise((resolve) => (finishRootList = resolve)))
      .mockResolvedValueOnce({
        entries: [{ name: 'index.ts', path: 'src/index.ts', type: 'file' }]
      })
      .mockResolvedValueOnce({
        entries: [{ name: 'index.ts', path: 'src/index.ts', type: 'file' }]
      });

    await act(async () => {
      store.setFileTree([{ name: 'src', path: 'src', type: 'directory', level: 0, loaded: false }]);
    });

    let refreshTask!: Promise<void>;
    await act(async () => {
      refreshTask = store.refreshWorkspace({ preserveExpandedDirs: true });
    });
    await act(async () => {
      await store.toggleDirectory({
        name: 'src',
        path: 'src',
        type: 'directory',
        level: 0,
        loaded: false
      });
    });
    expect(store.expandedDirs.has('src')).toBe(true);

    await act(async () => {
      finishRootList({ entries: [{ name: 'src', path: 'src', type: 'directory' }] });
      await refreshTask;
    });

    expect(store.expandedDirs.has('src')).toBe(true);
    expect(store.fileTree[0]).toEqual(
      expect.objectContaining({
        path: 'src',
        loaded: true,
        children: [expect.objectContaining({ path: 'src/index.ts' })]
      })
    );
  });

  it('opens conflict modal on 409 and supports reloading remote content or force-overwriting local edits', async () => {
    props = { ...props, isPreparing: false };
    await render();
    await act(async () => store.openFile('conflict.txt'));

    // 1. Save hits HTTP 409 -> populates conflictFilePath without firing error toast
    await edit('local edit v1');
    mocks.uploadFile.mockRejectedValueOnce(
      Object.assign(new Error('ETag conflict'), { code: 409 })
    );
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(store.conflictFilePath).toBe('conflict.txt');
    expect(mocks.toast).not.toHaveBeenCalled();

    // Option A: Reload remote file -> replaces content, updates ETag, clears dirty & conflict modal
    const remoteBytes = new TextEncoder().encode('agent updated text');
    mocks.readFile.mockResolvedValueOnce({
      bytes: remoteBytes,
      size: remoteBytes.byteLength,
      etag: '"v-remote"'
    });
    await act(async () => store.onReloadConflictFile());
    expect(store.conflictFilePath).toBeNull();
    expect(store.activeFile).toEqual(
      expect.objectContaining({
        path: 'conflict.txt',
        content: 'agent updated text',
        etag: '"v-remote"',
        isDirty: false,
        hasSaveError: false
      })
    );

    // 2. Edit again -> hit 409 -> Option B: Force overwrite without oldEtag -> updates ETag & clears conflict modal
    await edit('local force override');
    mocks.uploadFile
      .mockRejectedValueOnce(Object.assign(new Error('ETag conflict'), { status: 409 }))
      .mockResolvedValueOnce({
        path: 'conflict.txt',
        bytesWritten: 20,
        etag: '"v-forced"'
      });
    await act(async () => vi.advanceTimersByTimeAsync(500));
    expect(store.conflictFilePath).toBe('conflict.txt');

    await act(async () => store.onOverwriteConflictFile());
    expect(mocks.uploadFile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        path: 'conflict.txt',
        oldEtag: undefined
      })
    );
    expect(store.conflictFilePath).toBeNull();
    expect(store.activeFile).toEqual(
      expect.objectContaining({
        path: 'conflict.txt',
        content: 'local force override',
        etag: '"v-forced"',
        isDirty: false,
        hasSaveError: false
      })
    );
  });

  it('advances workspace epoch and clears tabs when isPreparing transitions from false to true in the same session', async () => {
    props = { ...props, isPreparing: false };
    await render();
    await act(async () => store.openFile('notes.txt'));
    await edit('dirty before re-init');

    let finishStaleRead!: (value: { bytes: Uint8Array; size: number; etag: string }) => void;
    mocks.readFile.mockImplementationOnce(
      () => new Promise((resolve) => (finishStaleRead = resolve))
    );
    let pendingOpen!: Promise<void>;
    await act(async () => {
      pendingOpen = store.openFile('in-flight.txt');
    });

    props = { ...props, isPreparing: true };
    await render();
    expect(store.openedFiles).toEqual([]);
    expect(store.activeFilePath).toBe('');

    const staleBytes = new TextEncoder().encode('from previous container');
    await act(async () => {
      finishStaleRead({ bytes: staleBytes, size: staleBytes.byteLength, etag: '"old"' });
      await pendingOpen;
    });
    expect(store.openedFiles).toEqual([]);
    expect(mocks.uploadFile).not.toHaveBeenCalled();
  });
});

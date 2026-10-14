import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { useChatInputForm } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatInputForm';
import {
  CHAT_INPUT_DRAFT_EXPIRE_MS,
  clearChatInputDrafts,
  readChatInputDraft,
  removeChatInputDraft,
  saveChatInputDraft,
  type ChatInputDraftIdentity
} from '@/web/core/chat/inputDraft/storage';

const identity = { tmbId: 'member', appId: 'app', chatId: 'A' };
const attachment = {
  key: 'chat/file.pdf',
  url: 'https://uploaded',
  name: 'file.pdf',
  type: 'file' as const
};
const uploadedFile = {
  ...attachment,
  id: 'file-id',
  uploadId: 'upload-id',
  icon: 'icon',
  status: 1 as const
};

describe('useChatInputForm', () => {
  let dom: JSDOM;
  let root: Root;
  let result: ReturnType<typeof useChatInputForm>;
  let mounted: boolean;
  const textarea = React.createRef<HTMLTextAreaElement>();
  const Harness = ({
    owner,
    withTextarea = true
  }: {
    owner?: ChatInputDraftIdentity;
    withTextarea?: boolean;
  }) => {
    result = useChatInputForm({
      sourceKey: 'app:app',
      chatId: owner?.chatId ?? 'no-owner',
      draftIdentity: owner,
      chatBoxSourceKey: 'app:app',
      chatRecordsLength: 0,
      chatType: ChatTypeEnum.chat,
      variableList: [],
      TextareaDom: textarea
    });
    return withTextarea ? React.createElement('textarea', { ref: textarea }) : null;
  };
  const render = async (
    owner: ChatInputDraftIdentity | undefined = identity,
    withTextarea = true
  ) => {
    await act(async () => root.render(React.createElement(Harness, { owner, withTextarea })));
    mounted = true;
  };
  const edit = async (text: string) => act(async () => result.setValue('input', text));
  const advance = async (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T02:00:00Z'));
    clearChatInputDrafts();
    root = createRoot(document.getElementById('root')!);
    mounted = false;
  });
  afterEach(async () => {
    if (mounted) await act(async () => root.unmount());
    vi.useRealTimers();
    clearChatInputDrafts();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('restores each conversation independently and flushes an edit before the debounce on switch', async () => {
    saveChatInputDraft({ identity, text: 'A saved', files: [] });
    const b = { ...identity, chatId: 'B' };
    saveChatInputDraft({ identity: b, text: 'B saved', files: [] });
    await render();
    expect(result.chatForm.getValues('input')).toBe('A saved');
    await edit('A latest');
    await advance(100);
    await render(b);
    expect(result.chatForm.getValues('input')).toBe('B saved');
    expect(readChatInputDraft(identity)?.text).toBe('A latest');
    await advance(500);
    expect(readChatInputDraft(b)?.text).toBe('B saved');
    await render(identity);
    expect(result.chatForm.getValues('input')).toBe('A latest');
  });

  it('flushes on pagehide and does not renew a restored draft', async () => {
    const updatedAt = Date.now() - 5000;
    saveChatInputDraft({ identity, text: 'saved', files: [attachment], updatedAt });
    await render();
    expect(result.chatForm.getValues('files')[0].url).toBe(attachment.url);
    expect(readChatInputDraft(identity)?.updatedAt).toBe(updatedAt);
    await edit('latest');
    await act(async () => window.dispatchEvent(new window.Event('pagehide')));
    expect(readChatInputDraft(identity)?.text).toBe('latest');
  });

  it('restores uploaded attachment URLs and text after remount without renewing the draft', async () => {
    await render();
    await act(async () => result.resetInputVal({ text: 'refresh draft', files: [uploadedFile] }));
    const saved = readChatInputDraft(identity)!;
    await act(async () => root.unmount());
    mounted = false;
    await advance(1000);
    root = createRoot(document.getElementById('root')!);
    await render();
    expect(result.chatForm.getValues('input')).toBe('refresh draft');
    expect(result.chatForm.getValues('files')[0]).toMatchObject(attachment);
    expect(readChatInputDraft(identity)?.updatedAt).toBe(saved.updatedAt);
  });

  it('never restores an expired draft', async () => {
    saveChatInputDraft({
      identity,
      text: 'old',
      files: [attachment],
      updatedAt: Date.now() - CHAT_INPUT_DRAFT_EXPIRE_MS
    });
    await render();
    expect(result.chatForm.getValues('input')).toBe('');
    expect(result.chatForm.getValues('files')).toEqual([]);
  });

  it('persists completed attachments immediately and drops pending files on conversation switch', async () => {
    await render();
    await act(async () =>
      result.setValue('files', [
        uploadedFile,
        { id: 'pending', type: 'file', name: 'pending.pdf', status: 0, icon: 'icon' }
      ])
    );
    expect(readChatInputDraft(identity)?.files).toEqual([attachment]);
    await render({ ...identity, chatId: 'B' });
    expect(result.chatForm.getValues('files')).toEqual([]);
    await render();
    expect(result.chatForm.getValues('files')).toHaveLength(1);
    expect(result.chatForm.getValues('files')[0].url).toBe(attachment.url);
  });

  it('updates and clears data even when the textarea is not mounted', async () => {
    await render(identity, false);
    await act(async () => result.resetInputVal({ text: 'no DOM', files: [uploadedFile] }));
    expect(result.chatForm.getValues('input')).toBe('no DOM');
    expect(readChatInputDraft(identity)?.files).toEqual([attachment]);
    await act(async () => result.resetInputVal({}));
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('clears accepted input synchronously and cancels stale pending saves', async () => {
    await render();
    await edit('submitted');
    const submission = result.captureSubmittedInput({ text: 'submitted', files: [] });
    await act(async () => result.clearSubmittedInput(submission));
    expect(result.chatForm.getValues('input')).toBe('');
    expect(readChatInputDraft(identity)).toBeUndefined();
    await advance(2000);
    expect(readChatInputDraft(identity)).toBeUndefined();
    await act(async () => result.restoreSubmittedInput(submission));
    expect(result.chatForm.getValues('input')).toBe('submitted');
    expect(readChatInputDraft(identity)?.text).toBe('submitted');
  });

  it('preserves input written while send validation or an older request was in flight', async () => {
    await render();
    await edit('submitted');
    const first = result.captureSubmittedInput({ text: 'submitted', files: [] });
    await edit('new while validating');
    await act(async () => result.clearSubmittedInput(first));
    expect(result.chatForm.getValues('input')).toBe('new while validating');
    await act(async () => result.restoreSubmittedInput(first));
    expect(result.chatForm.getValues('input')).toBe('new while validating');

    const next = result.captureSubmittedInput({ text: 'new while validating', files: [] });
    await act(async () => result.clearSubmittedInput(next));
    await edit('new while generating');
    await act(async () => result.restoreSubmittedInput(next));
    expect(result.chatForm.getValues('input')).toBe('new while generating');
  });

  it('restores a failed submission only to its original conversation', async () => {
    await render();
    await edit('A submission');
    const submission = result.captureSubmittedInput({ text: 'A submission', files: [] });
    await act(async () => result.clearSubmittedInput(submission));
    await render({ ...identity, chatId: 'B' });
    await edit('B draft');
    await act(async () => result.restoreSubmittedInput(submission));
    expect(result.chatForm.getValues('input')).toBe('B draft');
    expect(readChatInputDraft(identity)?.text).toBe('A submission');
  });

  it('does not revive drafts after deleting a conversation, including on unmount', async () => {
    await render();
    await edit('pending');
    const submission = result.captureSubmittedInput({ text: 'pending', files: [] });
    await act(async () => result.clearSubmittedInput(submission));
    await act(async () => removeChatInputDraft({ identity }));
    await act(async () => result.restoreSubmittedInput(submission));
    await advance(2000);
    expect(result.chatForm.getValues('input')).toBe('');
    expect(readChatInputDraft(identity)).toBeUndefined();
    await edit('another pending');
    await act(async () => clearChatInputDrafts());
    await act(async () => root.unmount());
    mounted = false;
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('restores cached image previews while progress and icons do not renew the draft', async () => {
    const updatedAt = Date.now() - 5000;
    const image = {
      key: 'chat/image.png',
      url: 'https://image-preview',
      name: 'image.png',
      type: 'image' as const
    };
    saveChatInputDraft({ identity, text: 'image draft', files: [image], updatedAt });
    await render();
    const runtimeImage = result.chatForm.getValues('files')[0];
    expect(runtimeImage.icon).toBe(image.url);
    await advance(1000);
    await act(async () => result.setValue('files', [{ ...runtimeImage, process: 50 }]));
    await act(async () => result.setValue('files', [{ ...runtimeImage, icon: 'data:base64' }]));
    await advance(1000);
    expect(readChatInputDraft(identity)?.updatedAt).toBe(updatedAt);
    expect(readChatInputDraft(identity)?.files).toEqual([image]);
  });

  it('supports a non-cached composer when the member identity is unavailable', async () => {
    await act(async () => root.render(React.createElement(Harness, { owner: undefined })));
    mounted = true;
    await edit('runtime input');
    const submission = result.captureSubmittedInput({ text: 'runtime input' });
    await act(async () => result.clearSubmittedInput(submission));
    await act(async () => result.restoreSubmittedInput(submission));
    expect(result.chatForm.getValues('input')).toBe('runtime input');
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('ignores unrelated cleanup and flushes beforeunload with an attachment-free draft', async () => {
    await render();
    await edit('keep');
    await act(async () => clearChatInputDrafts({ appId: 'other' }));
    expect(result.chatForm.getValues('input')).toBe('keep');
    await act(async () => window.dispatchEvent(new window.Event('beforeunload')));
    expect(readChatInputDraft(identity)?.text).toBe('keep');
  });

  it('rejects submissions whose member or cleanup epoch changed', async () => {
    await render();
    await edit('submitted');
    const submission = result.captureSubmittedInput({ text: 'submitted' });
    await render({ ...identity, tmbId: 'another member' });
    expect(result.isSubmittedInputCurrent(submission)).toBe(false);
    await edit('new member draft');
    const next = result.captureSubmittedInput({ text: 'new member draft' });
    await act(async () => clearChatInputDrafts());
    expect(result.isSubmittedInputCurrent(next)).toBe(false);
  });

  it('keeps active text sendable after cache expiry and never revives a deleted failed submission', async () => {
    await render();
    await edit('active text');
    await advance(CHAT_INPUT_DRAFT_EXPIRE_MS);
    const submission = result.captureSubmittedInput({ text: 'active text' });
    expect(result.isSubmittedInputCurrent(submission)).toBe(true);
    await act(async () => result.clearSubmittedInput(submission));
    await act(async () => removeChatInputDraft({ identity }));
    await advance(CHAT_INPUT_DRAFT_EXPIRE_MS);
    await act(async () => result.restoreSubmittedInput(submission));
    expect(result.chatForm.getValues('input')).toBe('');
    expect(readChatInputDraft(identity)).toBeUndefined();
  });
});

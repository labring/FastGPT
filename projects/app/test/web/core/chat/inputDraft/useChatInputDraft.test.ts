import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatBoxInputFormType } from '@/components/core/chat/ChatContainer/ChatBox/type';
import { useChatInputDraft } from '@/web/core/chat/inputDraft/useChatInputDraft';
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

describe('useChatInputDraft', () => {
  let dom: JSDOM;
  let root: Root;
  let result: ReturnType<typeof useChatInputDraft>;
  let chatForm: UseFormReturn<ChatBoxInputFormType>;
  let mounted: boolean;
  const onInputChange = vi.fn();
  const Harness = ({
    owner,
    withCallback = true
  }: {
    owner?: ChatInputDraftIdentity;
    withCallback?: boolean;
  }) => {
    chatForm = useForm<ChatBoxInputFormType>({
      defaultValues: { input: '', files: [], chatStarted: false }
    });
    result = useChatInputDraft({
      chatForm,
      identity: owner,
      fallbackKey: JSON.stringify(['app:app', owner?.chatId ?? 'no-owner']),
      onInputChange: withCallback ? onInputChange : undefined
    });
    return null;
  };
  const render = async (
    owner: ChatInputDraftIdentity | undefined = identity,
    withCallback = true
  ) => {
    await act(async () => root.render(React.createElement(Harness, { owner, withCallback })));
    mounted = true;
  };
  const edit = async (text: string) => act(async () => chatForm.setValue('input', text));
  const advance = async (ms: number) => act(async () => vi.advanceTimersByTimeAsync(ms));

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T02:00:00Z'));
    clearChatInputDrafts();
    onInputChange.mockClear();
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
    expect(chatForm.getValues('input')).toBe('A saved');
    expect(onInputChange).toHaveBeenLastCalledWith('A saved');
    await edit('A latest');
    await advance(100);
    await render(b);
    expect(chatForm.getValues('input')).toBe('B saved');
    expect(onInputChange).toHaveBeenLastCalledWith('B saved');
    expect(readChatInputDraft(identity)?.text).toBe('A latest');
    await advance(500);
    expect(readChatInputDraft(b)?.text).toBe('B saved');
    await render(identity);
    expect(chatForm.getValues('input')).toBe('A latest');
  });

  it('persists completed attachments immediately and drops pending files on conversation switch', async () => {
    await render();
    await act(async () =>
      chatForm.setValue('files', [
        uploadedFile,
        { id: 'pending', type: 'file', name: 'pending.pdf', status: 0, icon: 'icon' }
      ])
    );
    expect(readChatInputDraft(identity)?.files).toEqual([attachment]);
    await render({ ...identity, chatId: 'B' });
    expect(chatForm.getValues('files')).toEqual([]);
    await render();
    expect(chatForm.getValues('files')).toHaveLength(1);
    expect(chatForm.getValues('files')[0].url).toBe(attachment.url);
  });

  it('supports programmatic resets and clears without a UI callback', async () => {
    await render(identity, false);
    await act(async () => result.resetInputVal({ text: 'no DOM', files: [uploadedFile] }));
    expect(chatForm.getValues('input')).toBe('no DOM');
    expect(readChatInputDraft(identity)?.files).toEqual([attachment]);
    await act(async () => result.resetInputVal({}));
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('clears accepted input synchronously and cancels stale pending saves', async () => {
    await render();
    await edit('submitted');
    const submission = result.captureSubmittedInput({ text: 'submitted', files: [] });
    await act(async () => result.clearSubmittedInput(submission));
    expect(chatForm.getValues('input')).toBe('');
    expect(readChatInputDraft(identity)).toBeUndefined();
    await advance(2000);
    expect(readChatInputDraft(identity)).toBeUndefined();
    await act(async () => result.restoreSubmittedInput(submission));
    expect(chatForm.getValues('input')).toBe('submitted');
    expect(readChatInputDraft(identity)?.text).toBe('submitted');
  });

  it('preserves input written while send validation or an older request was in flight', async () => {
    await render();
    await edit('submitted');
    const first = result.captureSubmittedInput({ text: 'submitted', files: [] });
    await edit('new while validating');
    await act(async () => result.clearSubmittedInput(first));
    expect(chatForm.getValues('input')).toBe('new while validating');
    await act(async () => result.restoreSubmittedInput(first));
    expect(chatForm.getValues('input')).toBe('new while validating');

    const next = result.captureSubmittedInput({ text: 'new while validating', files: [] });
    await act(async () => result.clearSubmittedInput(next));
    await edit('new while generating');
    await act(async () => result.restoreSubmittedInput(next));
    expect(chatForm.getValues('input')).toBe('new while generating');
  });

  it('restores a failed submission only to its original conversation', async () => {
    await render();
    await edit('A submission');
    const submission = result.captureSubmittedInput({ text: 'A submission', files: [] });
    await act(async () => result.clearSubmittedInput(submission));
    await render({ ...identity, chatId: 'B' });
    await edit('B draft');
    await act(async () => result.restoreSubmittedInput(submission));
    expect(chatForm.getValues('input')).toBe('B draft');
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
    expect(chatForm.getValues('input')).toBe('');
    expect(readChatInputDraft(identity)).toBeUndefined();
    await edit('another pending');
    await act(async () => clearChatInputDrafts());
    await act(async () => root.unmount());
    mounted = false;
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('restores text and image previews after remount without renewing for restoration or progress', async () => {
    const image = {
      key: 'chat/image.png',
      url: 'https://image-preview',
      name: 'image.png',
      type: 'image' as const
    };
    await render();
    await act(async () =>
      result.resetInputVal({ text: 'image draft', files: [{ ...uploadedFile, ...image }] })
    );
    const updatedAt = readChatInputDraft(identity)?.updatedAt;
    await act(async () => root.unmount());
    mounted = false;
    await advance(1000);
    root = createRoot(document.getElementById('root')!);
    await render();
    expect(chatForm.getValues('input')).toBe('image draft');
    const runtimeImage = chatForm.getValues('files')[0];
    expect(runtimeImage).toMatchObject(image);
    expect(runtimeImage.icon).toBe(image.url);
    await advance(1000);
    await act(async () => chatForm.setValue('files', [{ ...runtimeImage, process: 50 }]));
    await act(async () => chatForm.setValue('files', [{ ...runtimeImage, icon: 'data:base64' }]));
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
    expect(chatForm.getValues('input')).toBe('runtime input');
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('ignores unrelated cleanup and flushes pending edits on page lifecycle events', async () => {
    await render();
    await edit('keep');
    await act(async () => clearChatInputDrafts({ appId: 'other' }));
    expect(chatForm.getValues('input')).toBe('keep');
    for (const event of ['pagehide', 'beforeunload']) {
      await edit(event);
      await act(async () => window.dispatchEvent(new window.Event(event)));
      expect(readChatInputDraft(identity)?.text).toBe(event);
    }
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
    expect(chatForm.getValues('input')).toBe('');
    expect(readChatInputDraft(identity)).toBeUndefined();
  });
});

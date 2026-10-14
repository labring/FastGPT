import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { ChatTypeEnum, textareaMinH } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import { useChatInputForm } from '@/components/core/chat/ChatContainer/ChatBox/hooks/useChatInputForm';
import {
  clearChatInputDrafts,
  readChatInputDraft,
  saveChatInputDraft
} from '@/web/core/chat/inputDraft/storage';

const identity = { tmbId: 'member', appId: 'app', chatId: 'A' };

describe('useChatInputForm', () => {
  let dom: JSDOM;
  let root: Root;
  let result: ReturnType<typeof useChatInputForm>;
  const textarea = React.createRef<HTMLTextAreaElement>();
  type Props = Partial<Omit<Parameters<typeof useChatInputForm>[0], 'TextareaDom'>> & {
    withTextarea?: boolean;
  };
  const Harness = ({ withTextarea = true, ...props }: Props) => {
    result = useChatInputForm({
      sourceKey: 'app:app',
      chatId: props.draftIdentity?.chatId ?? identity.chatId,
      draftIdentity: identity,
      chatBoxSourceKey: 'app:app',
      chatRecordsLength: 0,
      chatType: ChatTypeEnum.chat,
      variableList: [],
      ...props,
      TextareaDom: textarea
    });
    return withTextarea ? React.createElement('textarea', { ref: textarea }) : null;
  };
  const render = async (props: Props = {}) =>
    act(async () => root.render(React.createElement(Harness, props)));
  const variable = (type: VariableInputEnum): VariableItemType => ({
    key: type,
    label: type,
    type,
    description: ''
  });

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', { url: 'https://fastgpt.example' });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => callback(0));
    clearChatInputDrafts();
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    clearChatInputDrafts();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('initializes an empty composer and starts chats without user variables', async () => {
    await render();
    expect(result.chatForm.getValues()).toMatchObject({ input: '', files: [], chatStarted: false });
    expect(result.chatStartedWatch).toBe(false);
    expect(result.chatStarted).toBe(true);
    expect(textarea.current?.style.height).toBe(textareaMinH);
  });

  it('requires an explicit start for ordinary variables and observes the form start state', async () => {
    await render({ variableList: [variable(VariableInputEnum.input)] });
    expect(result.chatStarted).toBe(false);
    await act(async () => result.setValue('chatStarted', true));
    expect(result.chatStartedWatch).toBe(true);
    expect(result.chatStarted).toBe(true);
    expect(readChatInputDraft(identity)).toBeUndefined();
  });

  it('uses history only when it belongs to the current source', async () => {
    const props = { chatRecordsLength: 1, variableList: [variable(VariableInputEnum.input)] };
    await render({ ...props, chatBoxSourceKey: 'app:other' });
    expect(result.chatStarted).toBe(false);
    await render(props);
    expect(result.chatStarted).toBe(true);
  });

  it('does not require user input for internal variables', async () => {
    await render({ variableList: [variable(VariableInputEnum.internal)] });
    expect(result.chatStarted).toBe(true);
  });

  it.each([
    [ChatTypeEnum.chat, false],
    [ChatTypeEnum.home, false],
    [ChatTypeEnum.log, false],
    [ChatTypeEnum.test, false],
    [ChatTypeEnum.share, true]
  ])('preserves external variable start behavior for %s', async (chatType, expected) => {
    await render({ chatType, variableList: [variable(VariableInputEnum.custom)] });
    expect(result.chatStarted).toBe(expected);
  });

  it('forwards conversation identity to the draft hook and resizes restored or cleared input', async () => {
    saveChatInputDraft({ identity, text: 'A draft', files: [] });
    const b = { ...identity, chatId: 'B' };
    saveChatInputDraft({ identity: b, text: 'B draft', files: [] });
    const savedAt = readChatInputDraft(b)?.updatedAt;
    await render();
    expect(result.chatForm.getValues('input')).toBe('A draft');
    Object.defineProperty(textarea.current, 'scrollHeight', { value: 96, configurable: true });
    await render({ draftIdentity: b });
    expect(result.chatForm.getValues('input')).toBe('B draft');
    expect(textarea.current?.style.height).toBe('96px');
    expect(readChatInputDraft(b)?.updatedAt).toBe(savedAt);
    await act(async () => result.resetInputVal({}));
    expect(result.chatForm.getValues('input')).toBe('');
    expect(textarea.current?.style.height).toBe(textareaMinH);
    expect(readChatInputDraft(b)).toBeUndefined();
  });

  it('updates the form and draft before the textarea mounts', async () => {
    await render({ withTextarea: false });
    expect(textarea.current).toBeNull();
    await act(async () => result.resetInputVal({ text: 'no DOM' }));
    expect(result.chatForm.getValues('input')).toBe('no DOM');
    expect(readChatInputDraft(identity)?.text).toBe('no DOM');
  });
});

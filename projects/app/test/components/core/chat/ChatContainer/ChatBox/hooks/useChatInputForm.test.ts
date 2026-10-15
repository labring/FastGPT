import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useFieldArray, useWatch } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
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
  const Input = ({ input }: { input: ReturnType<typeof useChatInputForm> }) => {
    const inputValue = useWatch({ control: input.chatForm.control, name: 'input' });
    const { fields } = useFieldArray({ control: input.chatForm.control, name: 'files' });
    return React.createElement(
      React.Fragment,
      null,
      React.createElement('textarea', {
        ref: input.textareaRef,
        value: inputValue,
        readOnly: true
      }),
      React.createElement(
        'div',
        { 'data-testid': 'files' },
        fields.map((file) => file.name).join(',')
      )
    );
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
    return withTextarea ? React.createElement(Input, { input: result }) : null;
  };
  // 等待真实帧回调，让 useWatch 先提交新的 textarea value，再测量其 scrollHeight。
  const nextFrame = () =>
    act(async () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const render = async (props: Props = {}) => {
    await act(async () => root.render(React.createElement(Harness, props)));
    await nextFrame();
  };
  const variable = (type: VariableInputEnum): VariableItemType => ({
    key: type,
    label: type,
    type,
    description: ''
  });

  beforeEach(() => {
    dom = new JSDOM('<div id="root"></div>', {
      url: 'https://fastgpt.example',
      pretendToBeVisual: true
    });
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('FileList', dom.window.FileList);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('requestAnimationFrame', dom.window.requestAnimationFrame.bind(dom.window));
    clearChatInputDrafts();
    root = createRoot(document.getElementById('root')!);
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    clearChatInputDrafts();
    dom.window.close();
    vi.unstubAllGlobals();
  });

  it('initializes an empty composer and starts chats without user-provided variables', async () => {
    await render();
    expect(result.chatForm.getValues()).toMatchObject({ input: '', files: [], chatStarted: false });
    expect(result.chatStartedWatch).toBe(false);
    expect(result.chatStarted).toBe(true);
    expect(textarea.current?.style.height).toBe(textareaMinH);
    await render({ variableList: [variable(VariableInputEnum.internal)] });
    expect(result.chatStarted).toBe(true);
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

  it('preserves external variable start behavior across every chat entry', async () => {
    for (const [chatType, expected] of [
      [ChatTypeEnum.chat, false],
      [ChatTypeEnum.home, false],
      [ChatTypeEnum.log, false],
      [ChatTypeEnum.test, false],
      [ChatTypeEnum.share, true]
    ] as const) {
      await render({ chatType, variableList: [variable(VariableInputEnum.custom)] });
      expect(result.chatStarted, chatType).toBe(expected);
    }
  });

  it('resizes on conversation changes and delayed mounting, caps long input and resets on clear', async () => {
    const text = 'one\ntwo\nthree\nfour';
    const b = { ...identity, chatId: 'B' };
    const longText = Array.from({ length: 10 }, () => 'line').join('\n');
    saveChatInputDraft({ identity, text, files: [], updatedAt: Date.now() - 1000 });
    saveChatInputDraft({ identity: b, text: longText, files: [], updatedAt: Date.now() - 2000 });
    const savedAt = readChatInputDraft(identity)?.updatedAt;
    const savedAtB = readChatInputDraft(b)?.updatedAt;
    Object.defineProperty(dom.window.HTMLTextAreaElement.prototype, 'scrollHeight', {
      configurable: true,
      get() {
        return this.value.split('\n').length * 24;
      }
    });
    await render({ withTextarea: false });
    expect(result.chatForm.getValues('input')).toBe(text);
    await render();
    expect(textarea.current?.value).toBe(text);
    expect(textarea.current?.style.height).toBe('96px');
    expect(textarea.current?.style.overflowY).toBe('hidden');
    expect(readChatInputDraft(identity)?.updatedAt).toBe(savedAt);

    await render({ draftIdentity: b });
    expect(result.chatForm.getValues('input')).toBe(longText);
    expect(textarea.current?.style.height).toBe('128px');
    expect(textarea.current?.style.overflowY).toBe('auto');
    expect(readChatInputDraft(b)?.updatedAt).toBe(savedAtB);

    await render({ draftIdentity: b, withTextarea: false });
    await act(async () => result.resetInputVal({ text }));
    expect(readChatInputDraft(b)?.text).toBe(text);
    await render({ draftIdentity: b });
    expect(textarea.current?.style.height).toBe('96px');
    expect(textarea.current?.style.overflowY).toBe('hidden');
    await act(async () => result.resetInputVal({}));
    await nextFrame();
    expect(textarea.current?.style.height).toBe(textareaMinH);
    expect(textarea.current?.style.overflowY).toBe('hidden');
    expect(readChatInputDraft(b)).toBeUndefined();
    await render({ draftIdentity: b, withTextarea: false });
    expect(textarea.current).toBeNull();
  });

  it('updates newly mounted text and file subscribers when switching from a saved draft to a new chat', async () => {
    saveChatInputDraft({
      identity,
      text: 'A draft',
      files: [
        {
          key: 'chat/file.txt',
          url: 'https://uploaded',
          name: 'file.txt',
          type: ChatFileTypeEnum.file
        }
      ]
    });
    await render({ withTextarea: false });
    await render({ draftIdentity: { ...identity, chatId: 'new-chat' } });
    expect(result.chatForm.getValues('input')).toBe('');
    expect(result.chatForm.getValues('files')).toEqual([]);
    expect(textarea.current?.value).toBe('');
    expect(document.querySelector('[data-testid="files"]')?.textContent).toBe('');
    expect(readChatInputDraft(identity)?.text).toBe('A draft');
  });
});

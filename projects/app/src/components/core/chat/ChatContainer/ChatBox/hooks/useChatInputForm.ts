import { useEffect, useMemo, useRef, type MutableRefObject } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useMemoizedFn } from 'ahooks';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import type { ChatInputDraftIdentity } from '@/web/core/chat/inputDraft/storage';
import { useChatInputDraft } from '@/web/core/chat/inputDraft/useChatInputDraft';
import { ChatTypeEnum, textareaMinH } from '../constants';
import type { ChatBoxInputFormType } from '../type';

/**
 * 初始化输入表单，按入口和变量类型计算聊天启动状态，并维护 textarea 高度。
 * 会话草稿的保存、恢复和发送清理统一交给 useChatInputDraft。
 */
export const useChatInputForm = ({
  sourceKey,
  chatId,
  draftIdentity,
  chatBoxSourceKey,
  chatRecordsLength,
  chatType,
  variableList,
  TextareaDom: textareaDomRef
}: {
  sourceKey?: string;
  chatId?: string;
  draftIdentity?: ChatInputDraftIdentity;
  chatBoxSourceKey?: string;
  chatRecordsLength: number;
  chatType: ChatTypeEnum;
  variableList: VariableItemType[];
  TextareaDom: MutableRefObject<HTMLTextAreaElement | null>;
}) => {
  const chatForm = useForm<ChatBoxInputFormType>({
    defaultValues: { input: '', files: [], chatStarted: false }
  });
  const { setValue } = chatForm;
  const chatStartedWatch = useWatch({ control: chatForm.control, name: 'chatStarted' });
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastTextareaWidthRef = useRef<number>(0);

  const syncTextareaHeight = useMemoizedFn((textarea: HTMLTextAreaElement, text: string) => {
    const maxHeight = 128;
    textarea.style.height = textareaMinH;
    if (text) textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = text && textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
  });

  const resizeTextarea = useMemoizedFn((text: string) => {
    requestAnimationFrame(() => {
      if (textareaDomRef.current) {
        syncTextareaHeight(textareaDomRef.current, text);
      }
    });
  });

  // 会话初始化、变量填写或侧边面板宽度动画结束都可能晚于草稿恢复，挂载与宽度变化时补算高度。
  const textareaRef = useMemoizedFn((textarea: HTMLTextAreaElement | null) => {
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;
    textareaDomRef.current = textarea;
    if (!textarea) return;

    lastTextareaWidthRef.current = textarea.clientWidth;
    resizeTextarea(chatForm.getValues('input'));

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const currentWidth = entries[0]?.contentRect?.width ?? textarea.clientWidth;
        if (currentWidth !== lastTextareaWidthRef.current) {
          lastTextareaWidthRef.current = currentWidth;
          syncTextareaHeight(textarea, chatForm.getValues('input'));
        }
      });
      observer.observe(textarea);
      resizeObserverRef.current = observer;
    }
  });

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, []);

  const inputDraft = useChatInputDraft({
    chatForm,
    identity: draftIdentity,
    fallbackKey: JSON.stringify([sourceKey, chatId]),
    onInputChange: resizeTextarea
  });

  // 只有这些聊天入口会在 ChatBox 内展示外部变量；其它入口即使存在 custom 变量，
  // 也不应该用这里的判断改变输入区启动状态。
  const showExternalVariable = useMemo(() => {
    const map: Record<string, boolean> = {
      [ChatTypeEnum.log]: true,
      [ChatTypeEnum.test]: true,
      [ChatTypeEnum.chat]: true,
      [ChatTypeEnum.home]: true
    };
    return map[chatType] && variableList.some((item) => item.type === VariableInputEnum.custom);
  }, [variableList, chatType]);

  const commonVariableList = useMemo(
    () =>
      // internal 变量由系统注入，custom 变量走外部变量输入区；只有剩余变量才代表
      // 需要用户在普通变量表单里完成填写，进而影响 `chatStarted`。
      variableList.filter(
        (item) => item.type !== VariableInputEnum.custom && item.type !== VariableInputEnum.internal
      ),
    [variableList]
  );

  // 原 ChatBox 语义：同一个 app 下，有历史记录、用户手动开始，或没有需要填写的变量时，
  // 都认为对话已经开始。这里不检查变量值是否有效，真正的变量校验仍由发送流程负责。
  const chatStarted =
    chatBoxSourceKey === sourceKey &&
    (chatRecordsLength > 0 ||
      chatStartedWatch ||
      (commonVariableList.length === 0 && !showExternalVariable));

  return {
    chatForm,
    setValue,
    chatStarted,
    chatStartedWatch,
    textareaRef,
    ...inputDraft
  };
};

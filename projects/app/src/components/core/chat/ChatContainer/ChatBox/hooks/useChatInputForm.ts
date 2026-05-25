import { useMemo, type RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounceEffect, useMemoizedFn } from 'ahooks';
import type { VariableItemType } from '@fastgpt/global/core/app/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { ChatTypeEnum, textareaMinH } from '../constants';
import type { ChatBoxInputFormType, ChatBoxInputType } from '../type';

/**
 * 管理 ChatBox 输入表单、输入草稿和“对话是否已开始”的派生状态。
 *
 * 这个 hook 是 ChatBox 输入区的状态边界，刻意不处理发送请求、变量表单校验和
 * chatRecords 写入。调用方只需要从这里拿到 `chatForm`、`chatStarted` 和
 * `resetInputVal`，再决定是否允许触发真正的发送流程。
 *
 * 输入约定：
 * - `appId/chatId` 来自当前运行时上下文，用于区分不同 app 和不同会话。
 * - `chatBoxAppId` 来自当前 ChatBox 数据，用于避免 app 切换过程复用旧表单状态。
 * - `chatRecordsLength` 只用长度判断会话是否已有记录，避免把完整 records 传进输入 hook。
 * - `TextareaDom` 只在重置输入后恢复 textarea 高度，不参与渲染状态计算。
 *
 * 输出约定：
 * - `chatStarted` 表示当前会话已经可以展示输入区或直接发送。
 * - `chatStartedWatch` 保留给原有 UI 分支使用，表示用户是否手动点过开始。
 * - `resetInputVal` 会同时重置文本、文件、草稿和 textarea 高度。
 *
 * 关键边界：
 * - 草稿按 `chatInput_${chatId}` 存储，避免不同会话之间串输入内容。
 * - `chatStarted` 必须先确认 app 匹配；否则 app 切换时旧 records 或旧表单可能让新会话误判已开始。
 * - custom 变量属于外部变量输入，internal 变量不需要用户填写，二者都不应当按普通变量阻塞开始。
 */
export const useChatInputForm = ({
  appId,
  chatId,
  chatBoxAppId,
  chatRecordsLength,
  chatType,
  variableList,
  TextareaDom
}: {
  appId?: string;
  chatId?: string;
  chatBoxAppId?: string;
  chatRecordsLength: number;
  chatType: ChatTypeEnum;
  variableList: VariableItemType[];
  TextareaDom: RefObject<HTMLTextAreaElement>;
}) => {
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

  const chatForm = useForm<ChatBoxInputFormType>({
    defaultValues: {
      // react-hook-form 的 defaultValues 只在初始化时读取一次。这里沿用原逻辑：
      // 首次进入某个 chatId 时恢复草稿，后续切换由 ChatBox 重新挂载/状态流驱动。
      input: sessionStorage.getItem(`chatInput_${chatId}`) || '',
      files: [],
      chatStarted: false
    }
  });
  const { setValue, watch } = chatForm;
  const chatStartedWatch = watch('chatStarted');
  const inputValue = watch('input');

  useDebounceEffect(
    () => {
      // 输入过程中写 sessionStorage 会比较频繁，保持 debounce 可以减少同步 IO。
      // 空值直接删除 key，避免用户清空输入后下次进入会话仍恢复空草稿。
      if (inputValue) {
        sessionStorage.setItem(`chatInput_${chatId}`, inputValue);
      } else {
        sessionStorage.removeItem(`chatInput_${chatId}`);
      }
    },
    [inputValue, chatId],
    { wait: 300 }
  );

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
    chatBoxAppId === appId &&
    (chatRecordsLength > 0 ||
      chatStartedWatch ||
      (commonVariableList.length === 0 && !showExternalVariable));

  /**
   * 重置输入框内容。
   *
   * 调用场景包括发送成功后清空、编辑历史问题、发送失败后恢复用户输入。
   * 它必须同步更新 react-hook-form、sessionStorage 草稿和 textarea DOM 高度：
   * - form 值决定 ChatInput 当前展示内容。
   * - 草稿删除可以避免已发送内容在刷新后再次出现。
   * - textarea 高度是 DOM 计算结果，不能只靠 form state 自动恢复。
   */
  const resetInputVal = useMemoizedFn(({ text = '', files = [] }: ChatBoxInputType) => {
    if (!TextareaDom.current) return;
    setValue('files', files);
    setValue('input', text);

    sessionStorage.removeItem(`chatInput_${chatId}`);

    setTimeout(() => {
      /* 回到最小高度 */
      if (TextareaDom.current) {
        TextareaDom.current.style.height =
          text === '' ? textareaMinH : `${TextareaDom.current.scrollHeight}px`;
      }
    }, 100);
  });

  return {
    chatForm,
    setValue,
    chatStarted,
    chatStartedWatch,
    resetInputVal
  };
};

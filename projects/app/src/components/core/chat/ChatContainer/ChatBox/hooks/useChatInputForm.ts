import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounceFn, useMemoizedFn } from 'ahooks';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import {
  CHAT_INPUT_DRAFT_CLEAR_EVENT,
  getChatInputDraftContentKey,
  getChatInputDraftEpoch,
  getChatInputDraftKey,
  readChatInputDraft,
  removeChatInputDraft,
  saveChatInputDraft,
  serializeChatInputFiles,
  type ChatInputDraft,
  type ChatInputDraftIdentity
} from '@/web/core/chat/inputDraft/storage';
import { ChatTypeEnum, textareaMinH } from '../constants';
import type { ChatBoxInputFormType, ChatBoxInputType, UserInputFileItemType } from '../type';

export type ChatInputSubmission = {
  formKey: string;
  identity?: ChatInputDraftIdentity;
  revision: string;
  epoch: string;
  text: string;
  files: UserInputFileItemType[];
  /** 接受发送后记录空表单版本，失败只恢复未被继续编辑的表单。 */
  clearedRevision?: string;
};

type InputDraftState = Omit<ChatInputDraft, 'identity'> & {
  identity?: ChatInputDraftIdentity;
  formKey: string;
  epoch: string;
  runtimeFiles: UserInputFileItemType[];
  skipSave?: boolean;
};

/**
 * 表单只编辑当前会话；草稿按 tmbId/appId/chatId 隔离，最后修改后保留一小时。
 * 恢复不算编辑。发送快照清理和主动删除检查所有者和版本，草稿保存与恢复不请求后端。
 */
export const useChatInputForm = ({
  sourceKey,
  chatId,
  draftIdentity,
  chatBoxSourceKey,
  chatRecordsLength,
  chatType,
  variableList,
  TextareaDom
}: {
  sourceKey?: string;
  chatId?: string;
  draftIdentity?: ChatInputDraftIdentity;
  chatBoxSourceKey?: string;
  chatRecordsLength: number;
  chatType: ChatTypeEnum;
  variableList: VariableItemType[];
  TextareaDom: RefObject<HTMLTextAreaElement>;
}) => {
  const formKey = getChatInputDraftKey(draftIdentity) ?? JSON.stringify([sourceKey, chatId]);
  const chatForm = useForm<ChatBoxInputFormType>({
    defaultValues: { input: '', files: [], chatStarted: false }
  });
  const { setValue, watch } = chatForm;
  const chatStartedWatch = watch('chatStarted');
  const stateRef = useRef<InputDraftState>();
  const applyingRef = useRef(false);
  const mountedRef = useRef(false);
  const resizeTextarea = useMemoizedFn((text: string) => {
    requestAnimationFrame(() => {
      if (TextareaDom.current) {
        TextareaDom.current.style.height = textareaMinH;
        if (text) TextareaDom.current.style.height = `${TextareaDom.current.scrollHeight}px`;
      }
    });
  });

  // 恢复和发送清理是赋值操作，不让 watch 把恢复误判成一次新编辑。
  const applyForm = useMemoizedFn((state: InputDraftState) => {
    applyingRef.current = true;
    setValue('input', state.text);
    setValue('files', state.runtimeFiles);
    applyingRef.current = false;
    resizeTextarea(state.text);
  });

  const persistDraft = useMemoizedFn((state: InputDraftState) => {
    if (!state.identity || state.skipSave || state.epoch !== getChatInputDraftEpoch(state.identity))
      return;
    saveChatInputDraft({ ...state, identity: state.identity });
  });
  const {
    run: scheduleSave,
    cancel: cancelSave,
    flush: flushSave
  } = useDebounceFn(persistDraft, {
    wait: 300,
    maxWait: 1000
  });

  const restoreDraft = useMemoizedFn(() => {
    const draft = readChatInputDraft(draftIdentity);
    const runtimeFiles: UserInputFileItemType[] = (draft?.files ?? []).map((file) => ({
      ...file,
      id: getNanoid(),
      uploadId: getNanoid(),
      icon: file.type === 'image' ? file.url : getFileIcon(file.name),
      status: 1,
      process: 100
    }));
    const state: InputDraftState = {
      formKey,
      identity: draftIdentity,
      text: draft?.text ?? '',
      files: draft?.files ?? [],
      runtimeFiles,
      revision: draft?.revision ?? getNanoid(),
      updatedAt: draft?.updatedAt ?? Date.now(),
      epoch: getChatInputDraftEpoch(draftIdentity)
    };
    stateRef.current = state;
    applyForm(state);
  });

  useLayoutEffect(() => {
    mountedRef.current = true;
    restoreDraft();
    return () => {
      // layout cleanup 在新会话恢复前执行，始终保存仍由旧表单持有的快照。
      flushSave();
      cancelSave();
      mountedRef.current = false;
    };
  }, [formKey, restoreDraft, cancelSave, flushSave]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/incompatible-library -- 这是 RHF 的命令式草稿订阅，React Compiler 应跳过对此订阅的记忆化。
    const subscription = watch((values) => {
      const current = stateRef.current;
      if (!current || applyingRef.current) return;
      const runtimeFiles = (values.files ?? []) as UserInputFileItemType[];
      const files = serializeChatInputFiles(runtimeFiles);
      const text = values.input ?? '';
      if (getChatInputDraftContentKey(current) === getChatInputDraftContentKey({ text, files })) {
        current.runtimeFiles = runtimeFiles;
        return;
      }
      const next: InputDraftState = {
        ...current,
        text,
        files,
        runtimeFiles,
        revision: getNanoid(),
        updatedAt: Date.now(),
        epoch: getChatInputDraftEpoch(current.identity),
        skipSave: false
      };
      stateRef.current = next;
      const filesChanged =
        getChatInputDraftContentKey({ text: '', files: current.files }) !==
        getChatInputDraftContentKey({ text: '', files });
      if (filesChanged || (!text && files.length === 0)) {
        cancelSave();
        persistDraft(next);
      } else {
        scheduleSave(next);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, scheduleSave, cancelSave, persistDraft]);

  useEffect(() => {
    const flush = () => flushSave();
    const clear = (event: Event) => {
      const scope = (event as CustomEvent<Partial<ChatInputDraftIdentity>>).detail;
      const current = stateRef.current;
      if (
        !current?.identity ||
        !Object.entries(scope).every(
          ([key, value]) => current.identity?.[key as keyof ChatInputDraftIdentity] === value
        )
      )
        return;
      cancelSave();
      const next = {
        ...current,
        text: '',
        files: [],
        runtimeFiles: [],
        revision: getNanoid(),
        skipSave: true
      };
      stateRef.current = next;
      applyForm(next);
    };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', flush);
    window.addEventListener(CHAT_INPUT_DRAFT_CLEAR_EVENT, clear);
    return () => {
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener(CHAT_INPUT_DRAFT_CLEAR_EVENT, clear);
    };
  }, [flushSave, cancelSave, applyForm]);

  /** 普通赋值同时保存草稿，数据更新不依赖 textarea 是否已挂载。 */
  const resetInputVal = useMemoizedFn(({ text = '', files = [] }: ChatBoxInputType) => {
    const current = stateRef.current;
    if (!current) return;
    cancelSave();
    const next: InputDraftState = {
      ...current,
      text,
      runtimeFiles: files,
      files: serializeChatInputFiles(files),
      revision: getNanoid(),
      updatedAt: Date.now(),
      epoch: getChatInputDraftEpoch(current.identity),
      skipSave: false
    };
    stateRef.current = next;
    applyForm(next);
    persistDraft(next);
  });

  /** 发送前固定所有者和版本，并同步保存本轮占用的输入快照。 */
  const captureSubmittedInput = useMemoizedFn(
    ({ text = '', files = [] }: ChatBoxInputType): ChatInputSubmission => {
      const current = stateRef.current!;
      cancelSave();
      current.epoch = getChatInputDraftEpoch(current.identity);
      if (current.identity && !current.skipSave)
        saveChatInputDraft({ ...current, identity: current.identity });
      return {
        formKey: current.formKey,
        identity: current.identity,
        revision: current.revision,
        epoch: current.epoch,
        text,
        files
      };
    }
  );

  /** 发送异步等待后仍需属于当前成员和会话；期间继续编辑不取消已提交的快照。 */
  const isSubmittedInputCurrent = useMemoizedFn(
    (submission: ChatInputSubmission) =>
      mountedRef.current &&
      stateRef.current?.formKey === submission.formKey &&
      submission.epoch === getChatInputDraftEpoch(submission.identity)
  );

  /** 接受发送才删除本轮草稿；用户期间新写的内容保留在表单与缓存中。 */
  const clearSubmittedInput = useMemoizedFn((submission: ChatInputSubmission) => {
    submission.clearedRevision = getNanoid();
    if (submission.identity)
      removeChatInputDraft({
        identity: submission.identity,
        expectedRevision: submission.revision,
        notify: false
      });
    const current = stateRef.current;
    if (current?.formKey !== submission.formKey || current.revision !== submission.revision) return;
    cancelSave();
    const next = {
      ...current,
      text: '',
      files: [],
      runtimeFiles: [],
      revision: submission.clearedRevision,
      skipSave: true
    };
    stateRef.current = next;
    applyForm(next);
  });

  /** 未收到回复的失败只恢复本轮快照，不覆盖更新的草稿或已删除的会话。 */
  const restoreSubmittedInput = useMemoizedFn((submission: ChatInputSubmission) => {
    if (
      !submission.clearedRevision ||
      submission.epoch !== getChatInputDraftEpoch(submission.identity)
    )
      return;
    const current = stateRef.current;
    if (current?.formKey === submission.formKey) {
      if (current.revision !== submission.clearedRevision) return;
      resetInputVal(submission);
    } else if (submission.identity && !readChatInputDraft(submission.identity)) {
      saveChatInputDraft({
        identity: submission.identity,
        text: submission.text,
        files: serializeChatInputFiles(submission.files)
      });
    }
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
    resetInputVal,
    captureSubmittedInput,
    isSubmittedInputCurrent,
    clearSubmittedInput,
    restoreSubmittedInput
  };
};

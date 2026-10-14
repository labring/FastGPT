import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useForm } from 'react-hook-form';
import { useDebounceFn, useMemoizedFn } from 'ahooks';
import type { VariableItemType } from '@fastgpt/global/core/app/variable/type';
import { VariableInputEnum } from '@fastgpt/global/core/workflow/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import {
  CHAT_INPUT_DRAFT_CLEAR_EVENT,
  CHAT_INPUT_DRAFT_EXPIRE_MS,
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
import { prepareChatInputDraftFiles } from '@/web/common/file/api';
import type { ChatAuthTargetInput } from '@/web/core/chat/utils';
import { ChatTypeEnum, textareaMinH } from '../constants';
import type { ChatBoxInputFormType, ChatBoxInputType, UserInputFileItemType } from '../type';

export type ChatInputSubmission = {
  formKey: string;
  identity?: ChatInputDraftIdentity;
  revision: string;
  epoch: string;
  updatedAt: number;
  target?: ChatAuthTargetInput;
  text: string;
  files: UserInputFileItemType[];
  /** 接受发送后记录空表单版本，失败只恢复未被继续编辑的表单。 */
  clearedRevision?: string;
};

type InputDraftState = Omit<ChatInputDraft, 'identity'> & {
  identity?: ChatInputDraftIdentity;
  formKey: string;
  epoch: string;
  target?: ChatAuthTargetInput;
  runtimeFiles: UserInputFileItemType[];
  skipSave?: boolean;
};

/**
 * 表单只编辑当前会话；草稿按 tmbId/appId/chatId 隔离，最后修改后保留一小时。
 * 恢复与预览刷新不算编辑。发送快照清理、主动删除和迟到文件回调均检查所有者和版本。
 */
export const useChatInputForm = ({
  sourceKey,
  chatId,
  draftIdentity,
  draftTarget,
  chatBoxSourceKey,
  chatRecordsLength,
  chatType,
  variableList,
  TextareaDom
}: {
  sourceKey?: string;
  chatId?: string;
  draftIdentity?: ChatInputDraftIdentity;
  draftTarget?: ChatAuthTargetInput;
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
  const preparingRef = useRef(new Set<string>());
  const [draftFilesState, setDraftFilesState] = useState<'ready' | 'loading' | 'error'>('ready');

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

  /** 原始文件引用可以在网络失败期间保留；待上传的新文件仍不能进入草稿。 */
  const prepareFiles = useMemoizedFn(async (state: InputDraftState) => {
    const remainingMs = state.updatedAt + CHAT_INPUT_DRAFT_EXPIRE_MS - Date.now();
    if (!state.identity || state.files.length === 0 || remainingMs <= 0) return;
    const requestKey = JSON.stringify([state.formKey, state.revision]);
    if (preparingRef.current.has(requestKey)) return;
    preparingRef.current.add(requestKey);
    if (mountedRef.current && stateRef.current?.revision === state.revision) {
      setDraftFilesState('loading');
    }
    try {
      const results = await prepareChatInputDraftFiles({
        ...(state.target ?? { appId: state.identity.appId }),
        chatId: state.identity.chatId,
        keys: state.files.map((file) => file.key),
        remainingMs
      });
      const current = stateRef.current;
      if (
        !mountedRef.current ||
        current?.formKey !== state.formKey ||
        current.revision !== state.revision ||
        current.epoch !== getChatInputDraftEpoch(current.identity)
      )
        return;

      const resultMap = new Map(results.map((result) => [result.key, result]));
      const runtimeFiles = current.runtimeFiles.flatMap((file) => {
        const result = file.key ? resultMap.get(file.key) : undefined;
        if (!result) return [file];
        if (result.status === 'unavailable') return [];
        return [
          {
            ...file,
            url: result.url,
            icon: file.type === 'image' ? result.url : getFileIcon(file.name),
            status: 1 as const,
            process: 100
          }
        ];
      });
      const files = current.files.filter(
        (file) => resultMap.get(file.key)?.status !== 'unavailable'
      );
      const changed = files.length !== current.files.length;
      const next = {
        ...current,
        files,
        runtimeFiles,
        revision: changed ? getNanoid() : current.revision
      };
      stateRef.current = next;
      applyForm(next);
      if (changed && next.identity) saveChatInputDraft({ ...next, identity: next.identity });
      setDraftFilesState(
        results.some((result) => result.status === 'unavailable') ||
          current.files.some((file) => !resultMap.has(file.key))
          ? 'error'
          : 'ready'
      );
    } catch {
      if (
        mountedRef.current &&
        stateRef.current?.formKey === state.formKey &&
        stateRef.current.revision === state.revision
      ) {
        setDraftFilesState('error');
      }
    } finally {
      preparingRef.current.delete(requestKey);
    }
  });

  const persistDraft = useMemoizedFn((state: InputDraftState) => {
    if (!state.identity || state.skipSave || state.epoch !== getChatInputDraftEpoch(state.identity))
      return;
    saveChatInputDraft({ ...state, identity: state.identity });
    void prepareFiles(state);
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
      icon: getFileIcon(file.name),
      status: 1,
      process: 100
    }));
    const state: InputDraftState = {
      formKey,
      identity: draftIdentity,
      target: draftTarget,
      text: draft?.text ?? '',
      files: draft?.files ?? [],
      runtimeFiles,
      revision: draft?.revision ?? getNanoid(),
      updatedAt: draft?.updatedAt ?? Date.now(),
      epoch: getChatInputDraftEpoch(draftIdentity)
    };
    stateRef.current = state;
    applyForm(state);
    setDraftFilesState(runtimeFiles.length > 0 ? 'loading' : 'ready');
    void prepareFiles(state);
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
      const known = new Map(current.files.map((file) => [file.key, file]));
      const files = runtimeFiles.flatMap((file) => {
        const uploaded = serializeChatInputFiles([file]);
        return uploaded.length
          ? uploaded
          : file.key && known.has(file.key)
            ? [known.get(file.key)!]
            : [];
      });
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
      if (files.length === 0) setDraftFilesState('ready');
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
      setDraftFilesState('ready');
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
    if (next.files.length === 0) setDraftFilesState('ready');
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
        updatedAt: current.updatedAt,
        target: current.target,
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
    setDraftFilesState('ready');
  });

  /** 正式发送前再校验附件，防止输入框长时间停留后引用已经过期；失败时不清草稿。 */
  const prepareSubmittedInput = useMemoizedFn(async (submission: ChatInputSubmission) => {
    if (!isSubmittedInputCurrent(submission)) return false;
    if (!submission.identity || submission.files.length === 0) return true;
    const refs = serializeChatInputFiles(submission.files);
    if (refs.length !== submission.files.length) return false;
    const ownsForm = () =>
      isSubmittedInputCurrent(submission) && stateRef.current?.revision === submission.revision;
    if (ownsForm()) setDraftFilesState('loading');
    try {
      const results = await prepareChatInputDraftFiles({
        ...(submission.target ?? { appId: submission.identity.appId }),
        chatId: submission.identity.chatId,
        keys: refs.map((file) => file.key),
        remainingMs: Math.max(1, submission.updatedAt + CHAT_INPUT_DRAFT_EXPIRE_MS - Date.now())
      });
      const ready = new Map(
        results.flatMap((result) =>
          result.status === 'ready' ? [[result.key, result.url] as const] : []
        )
      );
      const available = refs.every((file) => ready.has(file.key));
      submission.files = submission.files.map((file) => ({
        ...file,
        url: ready.get(file.key ?? '') ?? file.url
      }));
      if (ownsForm()) {
        const current = stateRef.current!;
        const runtimeFiles = available
          ? submission.files
          : current.runtimeFiles.filter(
              (file) =>
                !file.key ||
                !results.some(
                  (result) => result.key === file.key && result.status === 'unavailable'
                )
            );
        const next = {
          ...current,
          runtimeFiles,
          files: current.files.filter((file) => runtimeFiles.some((item) => item.key === file.key)),
          revision: available ? current.revision : getNanoid()
        };
        stateRef.current = next;
        applyForm(next);
        if (!available && next.identity) saveChatInputDraft({ ...next, identity: next.identity });
        setDraftFilesState(available ? 'ready' : 'error');
      }
      return available && isSubmittedInputCurrent(submission);
    } catch {
      if (ownsForm()) setDraftFilesState('error');
      return false;
    }
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

  const retryDraftFiles = useMemoizedFn(() => {
    const current = stateRef.current;
    if (!current) return;
    if (current.files.length === 0) setDraftFilesState('ready');
    else void prepareFiles(current);
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
    prepareSubmittedInput,
    clearSubmittedInput,
    restoreSubmittedInput,
    draftFilesState,
    retryDraftFiles
  };
};

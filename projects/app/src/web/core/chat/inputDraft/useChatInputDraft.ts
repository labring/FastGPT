import { useEffect, useLayoutEffect, useRef } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useDebounceFn, useMemoizedFn } from 'ahooks';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { getFileIcon } from '@fastgpt/global/common/file/icon';
import type {
  ChatBoxInputFormType,
  ChatBoxInputType,
  UserInputFileItemType
} from '@/components/core/chat/ChatContainer/ChatBox/type';
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
} from './storage';

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
 * 在现有表单上管理纯客户端草稿：按成员、应用、会话保存文字及成功附件，切换前保存旧快照。
 * 恢复赋值不续期；发送清理和失败恢复检查所有者、版本和删除代次，避免覆盖新输入。
 * identity 未就绪时仅管理当前表单，fallbackKey 只用于区分表单所有者，不参与缓存键。
 * onInputChange 在程序赋值后通知调用方更新 UI，本 hook 不依赖 textarea 或变量状态。
 */
export const useChatInputDraft = ({
  chatForm,
  identity,
  fallbackKey,
  onInputChange
}: {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  identity?: ChatInputDraftIdentity;
  fallbackKey: string;
  onInputChange?: (text: string) => void;
}) => {
  const formKey = getChatInputDraftKey(identity) ?? fallbackKey;
  const { setValue, watch } = chatForm;
  const stateRef = useRef<InputDraftState>();
  const applyingRef = useRef(false);
  const mountedRef = useRef(false);

  // 恢复和发送清理是赋值操作，不让 watch 把恢复误判成一次新编辑。
  const applyForm = useMemoizedFn((state: InputDraftState) => {
    applyingRef.current = true;
    setValue('input', state.text);
    setValue('files', state.runtimeFiles);
    applyingRef.current = false;
    onInputChange?.(state.text);
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
    const draft = readChatInputDraft(identity);
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
      identity,
      text: draft?.text ?? '',
      files: draft?.files ?? [],
      runtimeFiles,
      revision: draft?.revision ?? getNanoid(),
      updatedAt: draft?.updatedAt ?? Date.now(),
      epoch: getChatInputDraftEpoch(identity)
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

  return {
    resetInputVal,
    captureSubmittedInput,
    isSubmittedInputCurrent,
    clearSubmittedInput,
    restoreSubmittedInput
  };
};

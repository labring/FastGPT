import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import type { AgentSkillDetailType } from '@fastgpt/global/core/ai/skill/type';
import type { SandboxStatusItemType } from '@fastgpt/global/core/chat/type';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { getSkillDetail, streamInitSkillRuntime } from '@/web/core/skill/api';
import { useSkillDebugChatStore } from './useSkillDebugChatStore';

export enum TabEnum {
  config = 'config',
  preview = 'preview'
}

export type SandboxState = 'idle' | 'loading' | 'ready' | 'failed';

type SkillDetailContextType = {
  skillId: string;
  skillDetail: AgentSkillDetailType | undefined;
  isFetchingSkillDetail: boolean;
  refreshSkillDetail: () => void;
  showHistories: boolean;
  setShowHistories: (v: boolean) => void;
  sandboxState: SandboxState;
  sandboxError: string | null;
  isSkillReady: boolean;
  startSandbox: () => void;
  saveAllRef: React.MutableRefObject<(() => Promise<void>) | undefined>;
  handleSandboxError: (err: string) => void;
  chatId: string;
  restartChat: () => void;
};

export const SkillDetailContext = createContext<SkillDetailContextType>({
  skillId: '',
  skillDetail: undefined,
  isFetchingSkillDetail: false,
  refreshSkillDetail: () => {},
  showHistories: false,
  setShowHistories: () => {},
  sandboxState: 'idle',
  sandboxError: null,
  isSkillReady: false,
  startSandbox: () => {},
  saveAllRef: { current: undefined },
  handleSandboxError: () => {},
  chatId: '',
  restartChat: () => {}
});

const SkillDetailContextProvider = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const { skillId: querySkillId } = router.query;
  const skillId = (Array.isArray(querySkillId) ? querySkillId[0] : querySkillId) ?? '';

  return (
    <SkillDetailContextProviderInner key={skillId || 'empty-skill'} skillId={skillId}>
      {children}
    </SkillDetailContextProviderInner>
  );
};

const SkillDetailContextProviderInner = ({
  children,
  skillId
}: {
  children: ReactNode;
  skillId: string;
}) => {
  const router = useRouter();
  const { t } = useSafeTranslation();
  const activeSkillId = useSkillDebugChatStore((state) => state.skillId);
  const activeChatId = useSkillDebugChatStore((state) => state.chatId);
  const setSkillId = useSkillDebugChatStore((state) => state.setSkillId);
  const setChatId = useSkillDebugChatStore((state) => state.setChatId);
  const chatId = activeSkillId === skillId ? activeChatId : '';

  const [showHistories, setShowHistories] = useState(false);

  // Sandbox states
  const [sandboxState, setSandboxState] = useState<SandboxState>('idle');
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const startedSkillIdRef = useRef('');
  const saveAllRef = useRef<() => Promise<void>>();

  useEffect(() => {
    if (skillId && activeSkillId !== skillId) {
      setSkillId(skillId);
    }
  }, [skillId, activeSkillId, setSkillId]);

  const restartChat = useCallback(() => {
    setChatId();
  }, [setChatId]);

  // 显式使用静态翻译字面量映射已知沙箱与技能错误码，避免动态 t(key) 破坏静态词条扫描。
  const translateErrorMessage = useCallback(
    (message: string) => {
      if (
        message.includes(SandboxErrEnum.runtimeUpgradeFailed) ||
        message.includes('runtime_upgrade_failed')
      ) {
        return t('skill:sandbox_runtime_upgrade_failed');
      }
      if (
        message.includes(SandboxErrEnum.agentSandboxLimitReached) ||
        message.includes('agent_sandbox_limit_reached')
      ) {
        return t('skill:sandbox_limit_reached');
      }
      if (
        message.includes(SandboxErrEnum.agentSandboxTeamLimitReached) ||
        message.includes('agent_sandbox_team_limit_reached')
      ) {
        return t('skill:sandbox_team_limit_reached');
      }
      if (
        message.includes(SandboxErrEnum.agentSandboxMigrationInProgress) ||
        message.includes('agent_sandbox_migration_in_progress')
      ) {
        return t('common:code_error.sandbox_error.agent_sandbox_migration_in_progress');
      }
      if (
        message.includes(SandboxErrEnum.agentSandboxInitializing) ||
        message.includes('agent_sandbox_initializing')
      ) {
        return t('common:code_error.sandbox_error.agent_sandbox_initializing');
      }
      if (
        message.includes(SandboxErrEnum.agentSandboxPermissionDenied) ||
        message.includes('agent_sandbox_permission_denied')
      ) {
        return t('common:code_error.sandbox_error.agent_sandbox_permission_denied');
      }
      if (
        message.includes(SkillErrEnum.invalidSkillId) ||
        message.includes('code_error.skill_error.invalid_skill_id')
      ) {
        return t('common:code_error.skill_error.invalid_skill_id');
      }
      if (
        message.includes(SkillErrEnum.noStorage) ||
        message.includes('code_error.skill_error.no_storage')
      ) {
        return t('common:code_error.skill_error.no_storage');
      }
      return message;
    },
    [t]
  );

  const initSandboxRuntime = useMemoizedFn(async () => {
    if (!skillId) return;

    abortCtrlRef.current?.abort();
    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;
    const isCurrentRequest = () => !abortCtrl.signal.aborted && abortCtrlRef.current === abortCtrl;

    setSandboxState('loading');
    setSandboxError(null);

    let hasShownInitError = false;
    const finishWithInitError = (error: unknown) => {
      if (!isCurrentRequest() || hasShownInitError) return;
      hasShownInitError = true;
      setSandboxError(String(getErrText(error)));
      setSandboxState('failed');
    };

    const handleSandboxPhase = (status: SandboxStatusItemType) => {
      if (status.phase === 'ready') {
        setSandboxError(null);
        setSandboxState('ready');
      } else if (status.phase === 'failed') {
        finishWithInitError(status.message ?? '');
      }
    };

    try {
      await streamInitSkillRuntime({
        data: { skillId },
        onStatus: (status) => {
          if (!isCurrentRequest()) return;
          handleSandboxPhase(status);
        },
        onError: finishWithInitError,
        abortCtrl
      });
    } catch (error) {
      finishWithInitError(error);
    }
  });

  const startSandbox = useCallback(() => {
    if (!skillId) return;
    startedSkillIdRef.current = skillId;
    void initSandboxRuntime();
  }, [initSandboxRuntime, skillId]);

  const handleSandboxError = useCallback((err: string) => {
    setSandboxError(err);
    setSandboxState('failed');
  }, []);

  // Skill detail fetch
  const {
    data: skillDetail,
    loading: isFetchingSkillDetail,
    run: refreshSkillDetail
  } = useRequest(
    () => {
      if (!skillId) return Promise.resolve(undefined);
      return getSkillDetail({ skillId }).then((res) => {
        const detail: AgentSkillDetailType = {
          ...res,
          type: AgentSkillTypeEnum.skill,
          teamId: res.teamId ?? '',
          tmbId: res.tmbId ?? '',
          currentVersionId: res.currentVersionId,
          creationStatus: res.creationStatus,
          creationError: res.creationError,
          createTime: new Date(res.createTime),
          updateTime: new Date(res.updateTime),
          appCount: res.appCount,
          permission: res.permission
        };
        return detail;
      });
    },
    {
      manual: false,
      refreshDeps: [skillId],
      errorToast: '',
      onError() {
        router.replace('/dashboard/skill');
      }
    }
  );

  const currentSkillDetail = skillDetail?._id === skillId ? skillDetail : undefined;
  const creationStatus = currentSkillDetail?.creationStatus;
  const isSkillCreating = creationStatus === AgentSkillCreationStatusEnum.creating;
  const isSkillCreateFailed = creationStatus === AgentSkillCreationStatusEnum.failed;
  const isSkillNoCurrentVersion =
    !!currentSkillDetail &&
    creationStatus === AgentSkillCreationStatusEnum.ready &&
    !currentSkillDetail.currentVersionId;
  const isSkillReady =
    !!currentSkillDetail &&
    creationStatus === AgentSkillCreationStatusEnum.ready &&
    !!currentSkillDetail.currentVersionId;
  const visibleSandboxState: SandboxState =
    isSkillCreateFailed || isSkillNoCurrentVersion ? 'failed' : sandboxState;
  const visibleSandboxError = (() => {
    if (isSkillCreateFailed) {
      return currentSkillDetail?.creationError
        ? translateErrorMessage(String(getErrText(currentSkillDetail.creationError)))
        : t('common:create_failed');
    }
    if (isSkillNoCurrentVersion) return t('skill:no_current_version');
    if (sandboxError === null) return null;
    return sandboxError ? translateErrorMessage(sandboxError) : t('skill:sandbox_error_title');
  })();

  useEffect(() => {
    if (!isSkillCreating) return;

    const timer = setInterval(() => {
      refreshSkillDetail();
    }, 2000);

    return () => clearInterval(timer);
  }, [isSkillCreating, refreshSkillDetail]);

  // Auto-start sandbox when skillId is ready
  useEffect(() => {
    if (skillId && isSkillReady && startedSkillIdRef.current !== skillId) {
      startSandbox();
    }
  }, [skillId, isSkillReady, startSandbox]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortCtrlRef.current?.abort();
    };
  }, []);

  const contextValue: SkillDetailContextType = useMemo(
    () => ({
      skillId,
      skillDetail: currentSkillDetail,
      isFetchingSkillDetail,
      refreshSkillDetail,
      showHistories,
      setShowHistories,
      sandboxState: visibleSandboxState,
      sandboxError: visibleSandboxError,
      isSkillReady,
      startSandbox,
      saveAllRef,
      handleSandboxError,
      chatId,
      restartChat
    }),
    [
      skillId,
      currentSkillDetail,
      isFetchingSkillDetail,
      refreshSkillDetail,
      showHistories,
      visibleSandboxState,
      visibleSandboxError,
      isSkillReady,
      startSandbox,
      handleSandboxError,
      chatId,
      restartChat
    ]
  );

  return <SkillDetailContext.Provider value={contextValue}>{children}</SkillDetailContext.Provider>;
};

export default SkillDetailContextProvider;

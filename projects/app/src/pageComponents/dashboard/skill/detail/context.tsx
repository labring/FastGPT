import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMemoizedFn } from 'ahooks';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { AgentSkillDetailType } from '@fastgpt/global/core/ai/skill/type';
import type { SandboxStatusItemType, SandboxStatusPhase } from '@fastgpt/global/core/chat/type';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import { getErrText } from '@fastgpt/global/common/error/utils';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import {
  getSkillDetail,
  getSkillRuntimeStatus,
  postUpgradeSkillRuntime,
  streamInitSkillRuntime
} from '@/web/core/skill/api';
import { useSkillDebugChatStore } from './useSkillDebugChatStore';
import { useSandboxRuntimeUpgrade } from '@/components/core/ai/useSandboxRuntimeUpgrade';

export enum TabEnum {
  config = 'config',
  preview = 'preview'
}

export type SandboxState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'failed'
  | 'upgradeRequired'
  | 'upgrading';

export type SandboxLogEntry = {
  timestamp: string;
  message: string;
  phase: SandboxStatusPhase;
};

type SkillDetailContextType = {
  skillId: string;
  skillDetail: AgentSkillDetailType | undefined;
  isFetchingSkillDetail: boolean;
  refreshSkillDetail: () => void;
  showHistories: boolean;
  setShowHistories: (v: boolean) => void;
  sandboxState: SandboxState;
  sandboxLogs: SandboxLogEntry[];
  sandboxError: string | null;
  isSkillReady: boolean;
  startSandbox: () => void;
  restartSandbox: () => void;
  upgradeSandboxRuntime: () => void;
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
  sandboxLogs: [],
  sandboxError: null,
  isSkillReady: false,
  startSandbox: () => {},
  restartSandbox: () => {},
  upgradeSandboxRuntime: () => {},
  saveAllRef: { current: undefined },
  handleSandboxError: () => {},
  chatId: '',
  restartChat: () => {}
});

const formatTimestamp = () => {
  const now = new Date();
  return [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
};

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
  const { t } = useTranslation();
  const activeSkillId = useSkillDebugChatStore((state) => state.skillId);
  const activeChatId = useSkillDebugChatStore((state) => state.chatId);
  const setSkillId = useSkillDebugChatStore((state) => state.setSkillId);
  const setChatId = useSkillDebugChatStore((state) => state.setChatId);
  const chatId = activeSkillId === skillId ? activeChatId : '';

  const [showHistories, setShowHistories] = useState(false);

  // Sandbox states
  const [sandboxState, setSandboxState] = useState<SandboxState>('idle');
  const [sandboxLogs, setSandboxLogs] = useState<SandboxLogEntry[]>([]);
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

  const phaseToMessage = useCallback(
    (status: SandboxStatusItemType): string => {
      const { phase, skillName, message, isWarmStart } = status;
      const map: Record<string, string> = {
        checkExisting: t('skill:sandbox_checking'),
        connecting: t('skill:sandbox_connecting'),
        fetchSkills: t('skill:sandbox_fetch_skills'),
        creatingContainer: t('skill:sandbox_creating_container'),
        deployingSkills: t('skill:sandbox_deploying_skills', { skillName: skillName || '' }),
        downloadingPackage: t('skill:sandbox_downloading'),
        uploadingPackage: t('skill:sandbox_uploading'),
        extractingPackage: t('skill:sandbox_extracting'),
        lazyInit: t('skill:sandbox_lazy_init'),
        ready: isWarmStart ? t('skill:sandbox_ready_warm') : t('skill:sandbox_ready'),
        failed: t('skill:sandbox_failed', { message: message || '' })
      };
      return map[phase] || message || phase;
    },
    [t]
  );

  const translateErrorMessage = useCallback(
    (message: string) => {
      if (
        message.includes(SandboxErrEnum.runtimeUpgradeInProgress) ||
        message.includes('runtime_upgrade_in_progress')
      ) {
        return t('skill:sandbox_runtime_upgrade_in_progress');
      }
      if (
        message.includes(SandboxErrEnum.runtimeUpgradeFailed) ||
        message.includes('runtime_upgrade_failed')
      ) {
        return t('skill:sandbox_runtime_upgrade_failed');
      }
      return t(message, { defaultValue: message });
    },
    [t]
  );
  const getSandboxErrorMessage = useCallback(
    (error: unknown, fallback: string) => translateErrorMessage(getErrText(error, fallback)),
    [translateErrorMessage]
  );

  const initSandboxRuntime = useMemoizedFn(async () => {
    if (!skillId) return;

    abortCtrlRef.current?.abort();
    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;
    const isCurrentRequest = () => !abortCtrl.signal.aborted && abortCtrlRef.current === abortCtrl;

    setSandboxState('loading');
    setSandboxLogs([]);
    setSandboxError(null);

    let hasShownInitError = false;
    const finishWithInitError = (error: unknown) => {
      if (!isCurrentRequest() || hasShownInitError) return;
      hasShownInitError = true;
      setSandboxError(getSandboxErrorMessage(error, t('skill:sandbox_error_title')));
      setSandboxState('failed');
    };

    const handleSandboxPhase = (status: SandboxStatusItemType) => {
      if (status.phase === 'ready') {
        setSandboxError(null);
        setSandboxState('ready');
      } else if (status.phase === 'failed') {
        finishWithInitError(status.message ?? t('skill:sandbox_error_title'));
      }
    };

    try {
      await streamInitSkillRuntime({
        data: { skillId },
        onStatus: (status) => {
          if (!isCurrentRequest()) return;
          setSandboxLogs((logs) => [
            ...logs,
            {
              timestamp: formatTimestamp(),
              message: phaseToMessage(status),
              phase: status.phase
            }
          ]);
          handleSandboxPhase(status);
        },
        onError: finishWithInitError,
        abortCtrl
      });
    } catch (error) {
      finishWithInitError(error);
    }
  });

  const requestRuntimeStatus = useMemoizedFn(() => getSkillRuntimeStatus({ skillId }));
  const requestRuntimeUpgrade = useMemoizedFn(() => postUpgradeSkillRuntime({ skillId }));
  const { runtimeStatus, checkRuntime, upgradeRuntime } = useSandboxRuntimeUpgrade({
    targetKey: skillId,
    getStatus: requestRuntimeStatus,
    upgrade: requestRuntimeUpgrade,
    getErrorMessage: (error) =>
      getSandboxErrorMessage(error, t('skill:sandbox_runtime_upgrade_failed')),
    onReady: initSandboxRuntime,
    onCheckError: (error) => {
      setSandboxError(getSandboxErrorMessage(error, t('skill:sandbox_error_title')));
      setSandboxState('failed');
    }
  });

  const startSandbox = useCallback(() => {
    if (!skillId) return;
    startedSkillIdRef.current = skillId;
    abortCtrlRef.current?.abort();
    setSandboxState('loading');
    setSandboxLogs([]);
    setSandboxError(null);
    void checkRuntime();
  }, [checkRuntime, skillId]);

  const upgradeSandboxRuntime = useCallback(() => {
    void upgradeRuntime();
  }, [upgradeRuntime]);

  const restartSandbox = useCallback(() => {
    startSandbox();
  }, [startSandbox]);

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
          appCount: res.appCount ?? 0,
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
  const runtimeSandboxState: SandboxState | undefined = (() => {
    if (runtimeStatus?.status === 'upgradeRequired') return 'upgradeRequired';
    if (runtimeStatus?.status === 'upgrading') return 'upgrading';
  })();
  const visibleSandboxState: SandboxState =
    isSkillCreateFailed || isSkillNoCurrentVersion
      ? 'failed'
      : (runtimeSandboxState ?? sandboxState);
  const visibleSandboxError = (() => {
    if (isSkillCreateFailed) return currentSkillDetail?.creationError || t('common:create_failed');
    if (isSkillNoCurrentVersion) return t('skill:no_current_version');
    if (runtimeStatus?.lastError) return translateErrorMessage(runtimeStatus.lastError);
    return sandboxError;
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
    return () => abortCtrlRef.current?.abort();
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
      sandboxLogs,
      sandboxError: visibleSandboxError,
      isSkillReady,
      startSandbox,
      restartSandbox,
      upgradeSandboxRuntime,
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
      sandboxLogs,
      visibleSandboxError,
      isSkillReady,
      startSandbox,
      restartSandbox,
      upgradeSandboxRuntime,
      handleSandboxError,
      chatId,
      restartChat
    ]
  );

  return <SkillDetailContext.Provider value={contextValue}>{children}</SkillDetailContext.Provider>;
};

export default SkillDetailContextProvider;

import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { AgentSkillDetailType } from '@fastgpt/global/core/ai/skill/type';
import type { SandboxStatusItemType, SandboxStatusPhase } from '@fastgpt/global/core/chat/type';
import { SandboxErrEnum } from '@fastgpt/global/common/error/code/sandbox';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import {
  getSkillDetail,
  getSkillRuntimeStatus,
  postUpgradeSkillRuntime,
  streamInitSkillRuntime
} from '@/web/core/skill/api';
import { useSkillDebugChatStore } from './useSkillDebugChatStore';
import type { SkillRuntimeStatusResponse } from '@fastgpt/global/core/ai/skill/api';

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

const RUNTIME_UPGRADE_POLL_INTERVAL_MS = 3000;

const isRuntimeUpgradeInProgressError = (err: unknown) => {
  const isRuntimeUpgradeInProgressText = (value: unknown) => {
    const text = String(value);
    return (
      text.includes(SandboxErrEnum.runtimeUpgradeInProgress) ||
      text.includes('runtime_upgrade_in_progress')
    );
  };

  if (typeof err === 'string') return isRuntimeUpgradeInProgressText(err);
  if (!err || typeof err !== 'object') return false;

  const errorData = err as {
    statusText?: unknown;
    message?: unknown;
    code?: unknown;
    response?: {
      data?: {
        statusText?: unknown;
        message?: unknown;
        code?: unknown;
      };
    };
  };
  const values = [
    errorData.statusText,
    errorData.message,
    errorData.code,
    errorData.response?.data?.statusText,
    errorData.response?.data?.message,
    errorData.response?.data?.code
  ];

  return values.some(isRuntimeUpgradeInProgressText);
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
  const { toast } = useToast();
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
  const runtimeUpgradePollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAllRef = useRef<() => Promise<void>>();

  const clearRuntimeUpgradePollTimer = useCallback(() => {
    if (!runtimeUpgradePollTimerRef.current) return;
    clearTimeout(runtimeUpgradePollTimerRef.current);
    runtimeUpgradePollTimerRef.current = null;
  }, []);

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

  const startRuntimeFlow = useCallback(
    (mode: 'check' | 'upgrade') => {
      if (!skillId) return;

      if (mode === 'check') {
        startedSkillIdRef.current = skillId;
      }

      abortCtrlRef.current?.abort();
      clearRuntimeUpgradePollTimer();

      const abortCtrl = new AbortController();
      abortCtrlRef.current = abortCtrl;

      const isCurrentRequest = () =>
        !abortCtrl.signal.aborted && abortCtrlRef.current === abortCtrl;
      const translateErrorMessage = (message: string) => {
        if (
          message === SandboxErrEnum.runtimeUpgradeInProgress ||
          message.includes('runtime_upgrade_in_progress')
        ) {
          return t('skill:sandbox_runtime_upgrade_in_progress');
        }
        if (
          message === SandboxErrEnum.runtimeUpgradeFailed ||
          message.includes('runtime_upgrade_failed')
        ) {
          return t('skill:sandbox_runtime_upgrade_failed');
        }
        return t(message, { defaultValue: message });
      };
      const getErrorMessage = (err: unknown, fallback = t('skill:sandbox_error_title')): string => {
        if (typeof err === 'string') return translateErrorMessage(err);
        if (err instanceof Error) return translateErrorMessage(err.message);
        if (!err || typeof err !== 'object') return fallback;

        const errorData = err as {
          message?: unknown;
          response?: {
            data?: {
              message?: unknown;
            };
          };
        };
        const message = errorData.message ?? errorData.response?.data?.message;
        return typeof message === 'string' && message ? translateErrorMessage(message) : fallback;
      };
      const enterRuntimeUpgradePolling = () => {
        if (!isCurrentRequest()) return;
        setSandboxState('upgrading');
        setSandboxError(null);
        scheduleRuntimeStatusPoll();
      };

      const showInitError = (message: string) => {
        if (!isCurrentRequest()) return;
        setSandboxError(translateErrorMessage(message));
        setSandboxState('failed');
      };

      const showUpgradeError = (message = t('skill:sandbox_runtime_upgrade_failed')) => {
        if (!isCurrentRequest()) return;
        const translatedMessage = translateErrorMessage(message);
        clearRuntimeUpgradePollTimer();
        setSandboxError(translatedMessage);
        setSandboxState('upgradeRequired');
        toast({
          status: 'error',
          title: translatedMessage
        });
      };
      const getRuntimeUpgradeErrorMessage = (message?: string) => {
        if (!message || message === SandboxErrEnum.runtimeUpgradeFailed) {
          return t('skill:sandbox_runtime_upgrade_failed');
        }
        return translateErrorMessage(message);
      };

      /**
       * Skill Edit runtime 的唯一前端状态机入口。
       * check/upgrade/轮询都复用该分支，避免主动升级和其他用户升级中的处理结果不一致。
       */
      async function applyRuntimeStatus(
        status: SkillRuntimeStatusResponse,
        options?: { hasSeenUpgrading?: boolean }
      ) {
        if (!isCurrentRequest()) return;

        switch (status.status) {
          case 'readyToInit':
            clearRuntimeUpgradePollTimer();
            setSandboxState('loading');
            setSandboxError(null);
            await initSandboxRuntime();
            return;
          case 'upgradeRequired':
            clearRuntimeUpgradePollTimer();
            if (options?.hasSeenUpgrading) {
              showUpgradeError(getRuntimeUpgradeErrorMessage(status.lastError));
              return;
            }
            setSandboxError(status.lastError ? translateErrorMessage(status.lastError) : null);
            setSandboxState('upgradeRequired');
            return;
          case 'upgrading':
            setSandboxState('upgrading');
            setSandboxError(null);
            scheduleRuntimeStatusPoll();
            return;
        }
      }

      async function pollRuntimeStatus() {
        if (!isCurrentRequest()) return;

        const status = await getSkillRuntimeStatus({ skillId });
        if (!isCurrentRequest()) return;

        await applyRuntimeStatus(status, { hasSeenUpgrading: true });
      }

      function scheduleRuntimeStatusPoll() {
        if (!isCurrentRequest()) return;

        clearRuntimeUpgradePollTimer();
        runtimeUpgradePollTimerRef.current = setTimeout(() => {
          runtimeUpgradePollTimerRef.current = null;
          void pollRuntimeStatus().catch(() => {
            showUpgradeError();
          });
        }, RUNTIME_UPGRADE_POLL_INTERVAL_MS);
      }

      async function initSandboxRuntime() {
        if (!isCurrentRequest()) return;

        setSandboxState('loading');
        setSandboxLogs([]);
        setSandboxError(null);

        let hasShownInitError = false;
        const finishWithInitError = (message: string) => {
          if (!isCurrentRequest() || hasShownInitError) return;
          hasShownInitError = true;
          showInitError(message);
        };

        const handleSandboxPhase = (status: SandboxStatusItemType) => {
          switch (status.phase) {
            case 'ready':
              clearRuntimeUpgradePollTimer();
              setSandboxError(null);
              setSandboxState('ready');
              return;
            case 'failed':
              finishWithInitError(
                status.message
                  ? translateErrorMessage(status.message)
                  : t('skill:sandbox_error_title')
              );
              return;
            default:
              return;
          }
        };

        try {
          await streamInitSkillRuntime({
            data: { skillId },
            onStatus: (status) => {
              if (!isCurrentRequest()) return;

              const entry: SandboxLogEntry = {
                timestamp: formatTimestamp(),
                message: phaseToMessage(status),
                phase: status.phase
              };
              setSandboxLogs((prev) => [...prev, entry]);

              handleSandboxPhase(status);
            },
            onError: (err) => {
              finishWithInitError(err);
            },
            abortCtrl
          });
        } catch (err) {
          if (!isCurrentRequest()) return;
          finishWithInitError(getErrorMessage(err));
        }
      }

      const runStatusCheck = async () => {
        setSandboxState('loading');
        setSandboxLogs([]);
        setSandboxError(null);

        try {
          const status = await getSkillRuntimeStatus({ skillId });
          await applyRuntimeStatus(status);
        } catch (err) {
          if (!isCurrentRequest()) return;
          showInitError(getErrorMessage(err));
        }
      };

      const runUpgrade = async () => {
        setSandboxState('upgrading');
        setSandboxError(null);

        try {
          const status = await postUpgradeSkillRuntime({ skillId });
          await applyRuntimeStatus(status);
        } catch (err) {
          if (!isCurrentRequest()) return;

          // 并发触发时后端会拒绝重复 upgrade；客户端进入 upgrading 并轮询最终状态。
          if (isRuntimeUpgradeInProgressError(err)) {
            enterRuntimeUpgradePolling();
            return;
          }

          showUpgradeError(getErrorMessage(err, t('skill:sandbox_runtime_upgrade_failed')));
        }
      };

      void (mode === 'check' ? runStatusCheck() : runUpgrade());
    },
    [skillId, clearRuntimeUpgradePollTimer, phaseToMessage, t, toast]
  );

  const startSandbox = useCallback(() => {
    startRuntimeFlow('check');
  }, [startRuntimeFlow]);

  const upgradeSandboxRuntime = useCallback(() => {
    startRuntimeFlow('upgrade');
  }, [startRuntimeFlow]);

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
  const visibleSandboxState: SandboxState =
    isSkillCreateFailed || isSkillNoCurrentVersion ? 'failed' : sandboxState;
  const visibleSandboxError = (() => {
    if (isSkillCreateFailed) return currentSkillDetail?.creationError || t('common:create_failed');
    if (isSkillNoCurrentVersion) return t('skill:no_current_version');
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
    return () => {
      abortCtrlRef.current?.abort();
      clearRuntimeUpgradePollTimer();
    };
  }, [clearRuntimeUpgradePollTimer]);

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

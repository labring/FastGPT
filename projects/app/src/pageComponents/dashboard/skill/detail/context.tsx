import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { AgentSkillDetailType } from '@fastgpt/global/core/ai/skill/type';
import type { SandboxStatusItemType, SandboxStatusPhase } from '@fastgpt/global/core/chat/type';
import {
  AgentSkillCreationStatusEnum,
  AgentSkillTypeEnum
} from '@fastgpt/global/core/ai/skill/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { getSkillDetail, streamCreateEditDebugSandbox } from '@/web/core/skill/api';
import { useSkillDebugChatStore } from './useSkillDebugChatStore';

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
        runtimeUpgradeRequired: t('skill:sandbox_runtime_upgrade_required'),
        runtimeUpgradeArchiving: t('skill:sandbox_runtime_upgrade_archiving'),
        runtimeUpgradeArchived: t('skill:sandbox_runtime_upgrade_archived'),
        lazyInit: t('skill:sandbox_lazy_init'),
        ready: isWarmStart ? t('skill:sandbox_ready_warm') : t('skill:sandbox_ready'),
        failed: t('skill:sandbox_failed', { message: message || '' })
      };
      return map[phase] || message || phase;
    },
    [t]
  );

  const startSandbox = useCallback(
    (options?: { archiveForUpgrade?: boolean }) => {
      if (!skillId) return;

      startedSkillIdRef.current = skillId;

      // Abort previous if any
      abortCtrlRef.current?.abort();
      clearRuntimeUpgradePollTimer();

      const abortCtrl = new AbortController();
      abortCtrlRef.current = abortCtrl;

      const runSandboxStream = async (runOptions?: {
        archiveForUpgrade?: boolean;
        keepUpgradeState?: boolean;
      }) => {
        if (!runOptions?.keepUpgradeState) {
          setSandboxState(runOptions?.archiveForUpgrade ? 'upgrading' : 'idle');
          setSandboxLogs([]);
          setSandboxError(null);
        }

        let hasReceivedFirstEvent = false;
        let hasShownError = false;
        let isRuntimeUpgradeFlow =
          !!runOptions?.archiveForUpgrade || !!runOptions?.keepUpgradeState;
        let shouldPollRuntimeUpgrade = false;
        let shouldRestartAfterRuntimeUpgrade = false;

        const showSandboxError = (err: string) => {
          if (abortCtrl.signal.aborted || abortCtrlRef.current !== abortCtrl) return;
          if (hasShownError) return;
          hasShownError = true;
          setSandboxError(err);
          if (isRuntimeUpgradeFlow) {
            toast({
              status: 'error',
              title: err
            });
          }
          setSandboxState(isRuntimeUpgradeFlow ? 'upgradeRequired' : 'failed');
        };

        const handleSandboxPhase = (status: SandboxStatusItemType) => {
          switch (status.phase) {
            case 'ready':
              shouldPollRuntimeUpgrade = false;
              setSandboxState('ready');
              return;
            case 'runtimeUpgradeRequired':
              setSandboxState('upgradeRequired');
              return;
            case 'runtimeUpgradeArchiving':
              isRuntimeUpgradeFlow = true;
              setSandboxState('upgrading');
              shouldPollRuntimeUpgrade = true;
              return;
            case 'runtimeUpgradeArchived':
              isRuntimeUpgradeFlow = true;
              shouldPollRuntimeUpgrade = false;
              shouldRestartAfterRuntimeUpgrade = true;
              setSandboxState('upgrading');
              return;
            case 'failed':
              showSandboxError(
                isRuntimeUpgradeFlow
                  ? t('skill:sandbox_runtime_upgrade_failed')
                  : status.message || t('skill:sandbox_error_title')
              );
              return;
            default:
              return;
          }
        };

        try {
          await streamCreateEditDebugSandbox({
            data: {
              skillId,
              ...(runOptions?.archiveForUpgrade ? { archiveForUpgrade: true } : {})
            },
            onStatus: (status) => {
              if (abortCtrl.signal.aborted || abortCtrlRef.current !== abortCtrl) return;

              // 收到第一条 SSE 消息后才从 idle 切到 loading（终端日志）
              if (!hasReceivedFirstEvent) {
                hasReceivedFirstEvent = true;
                setSandboxState(
                  runOptions?.archiveForUpgrade || runOptions?.keepUpgradeState
                    ? 'upgrading'
                    : 'loading'
                );
              }

              const entry: SandboxLogEntry = {
                timestamp: formatTimestamp(),
                message: phaseToMessage(status),
                phase: status.phase
              };
              setSandboxLogs((prev) => [...prev, entry]);

              handleSandboxPhase(status);
            },
            onError: (err) => {
              if (abortCtrl.signal.aborted || abortCtrlRef.current !== abortCtrl) return;

              showSandboxError(
                isRuntimeUpgradeFlow ? t('skill:sandbox_runtime_upgrade_failed') : err
              );
            },
            abortCtrl
          });
        } catch (err) {
          if (abortCtrl.signal.aborted) return;
          showSandboxError(
            isRuntimeUpgradeFlow
              ? t('skill:sandbox_runtime_upgrade_failed')
              : typeof err === 'string'
                ? err
                : err instanceof Error
                  ? err.message
                  : String(err)
          );
          return;
        }

        if (
          shouldRestartAfterRuntimeUpgrade &&
          !abortCtrl.signal.aborted &&
          abortCtrlRef.current === abortCtrl
        ) {
          await runSandboxStream({ keepUpgradeState: true });
          return;
        }

        if (
          shouldPollRuntimeUpgrade &&
          !abortCtrl.signal.aborted &&
          abortCtrlRef.current === abortCtrl
        ) {
          runtimeUpgradePollTimerRef.current = setTimeout(() => {
            if (abortCtrlRef.current !== abortCtrl) return;
            void runSandboxStream({ keepUpgradeState: true }).catch(() => {
              if (abortCtrl.signal.aborted || abortCtrlRef.current !== abortCtrl) return;
              showSandboxError(t('skill:sandbox_runtime_upgrade_failed'));
            });
          }, RUNTIME_UPGRADE_POLL_INTERVAL_MS);
        }
      };

      void runSandboxStream(options).catch((err) => {
        if (abortCtrl.signal.aborted) return;
        const message = options?.archiveForUpgrade
          ? t('skill:sandbox_runtime_upgrade_failed')
          : typeof err === 'string'
            ? err
            : err?.message || String(err);
        setSandboxError(message);
        if (options?.archiveForUpgrade) {
          toast({
            status: 'error',
            title: message
          });
        }
        setSandboxState(options?.archiveForUpgrade ? 'upgradeRequired' : 'failed');
      });
    },
    [skillId, clearRuntimeUpgradePollTimer, phaseToMessage, t, toast]
  );

  const restartSandbox = useCallback(() => {
    startSandbox();
  }, [startSandbox]);

  const upgradeSandboxRuntime = useCallback(() => {
    startSandbox({ archiveForUpgrade: true });
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

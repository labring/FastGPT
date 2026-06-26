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
  isUpgradeModalOpen: boolean;
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
  isUpgradeModalOpen: false,
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
  const { t } = useTranslation();
  const { skillId: querySkillId } = router.query;
  const skillId = (Array.isArray(querySkillId) ? querySkillId[0] : querySkillId) ?? '';
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
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
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

      // Abort previous if any
      abortCtrlRef.current?.abort();

      const abortCtrl = new AbortController();
      abortCtrlRef.current = abortCtrl;

      const runSandboxStream = async (runOptions?: { archiveForUpgrade?: boolean }) => {
        setSandboxState('idle');
        setSandboxLogs([]);
        setSandboxError(null);
        if (!runOptions?.archiveForUpgrade) {
          setIsUpgradeModalOpen(false);
        }

        let hasReceivedFirstEvent = false;
        let shouldRestartAfterArchive = false;

        const handleSandboxPhase = (status: SandboxStatusItemType) => {
          switch (status.phase) {
            case 'ready':
              setSandboxState('ready');
              return;
            case 'runtimeUpgradeRequired':
              setIsUpgradeModalOpen(true);
              setSandboxState('upgradeRequired');
              return;
            case 'runtimeUpgradeArchiving':
              setSandboxState('upgrading');
              return;
            case 'runtimeUpgradeArchived':
              setIsUpgradeModalOpen(false);
              shouldRestartAfterArchive = true;
              return;
            case 'failed':
              setSandboxError(status.message || t('skill:sandbox_error_title'));
              setSandboxState('failed');
              return;
            default:
              return;
          }
        };

        await streamCreateEditDebugSandbox({
          data: { skillId, ...(runOptions?.archiveForUpgrade ? { archiveForUpgrade: true } : {}) },
          onStatus: (status) => {
            // 收到第一条 SSE 消息后才从 idle 切到 loading（终端日志）
            if (!hasReceivedFirstEvent) {
              hasReceivedFirstEvent = true;
              setSandboxState(runOptions?.archiveForUpgrade ? 'upgrading' : 'loading');
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
            setSandboxError(err);
            setSandboxState('failed');
          },
          abortCtrl
        });

        if (abortCtrl.signal.aborted || !shouldRestartAfterArchive) return;
        await runSandboxStream();
      };

      void runSandboxStream(options).catch((err) => {
        if (abortCtrl.signal.aborted) return;
        setSandboxError(typeof err === 'string' ? err : err?.message || String(err));
        setSandboxState('failed');
      });
    },
    [skillId, phaseToMessage, t]
  );

  const restartSandbox = useCallback(() => {
    hasStartedRef.current = true;
    startSandbox();
  }, [startSandbox]);

  const upgradeSandboxRuntime = useCallback(() => {
    hasStartedRef.current = true;
    setIsUpgradeModalOpen(false);
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

  const creationStatus = skillDetail?.creationStatus;
  const isSkillCreating = creationStatus === AgentSkillCreationStatusEnum.creating;
  const isSkillCreateFailed = creationStatus === AgentSkillCreationStatusEnum.failed;
  const isSkillNoCurrentVersion =
    !!skillDetail &&
    creationStatus === AgentSkillCreationStatusEnum.ready &&
    !skillDetail.currentVersionId;
  const isSkillReady =
    !!skillDetail &&
    creationStatus === AgentSkillCreationStatusEnum.ready &&
    !!skillDetail.currentVersionId;
  const visibleSandboxState: SandboxState =
    isSkillCreateFailed || isSkillNoCurrentVersion ? 'failed' : sandboxState;
  const visibleSandboxError = (() => {
    if (isSkillCreateFailed) return skillDetail?.creationError || t('common:create_failed');
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
    if (skillId && isSkillReady && !hasStartedRef.current) {
      hasStartedRef.current = true;
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
      skillDetail,
      isFetchingSkillDetail,
      refreshSkillDetail,
      showHistories,
      setShowHistories,
      sandboxState: visibleSandboxState,
      sandboxLogs,
      sandboxError: visibleSandboxError,
      isUpgradeModalOpen,
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
      skillDetail,
      isFetchingSkillDetail,
      refreshSkillDetail,
      showHistories,
      visibleSandboxState,
      sandboxLogs,
      visibleSandboxError,
      isUpgradeModalOpen,
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

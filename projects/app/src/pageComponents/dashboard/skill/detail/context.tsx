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

export enum TabEnum {
  config = 'config',
  preview = 'preview'
}

export type SandboxState = 'idle' | 'loading' | 'ready' | 'failed';

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
  currentTab: TabEnum;
  setCurrentTab: (tab: TabEnum) => void;
  showHistories: boolean;
  setShowHistories: (v: boolean) => void;
  sandboxState: SandboxState;
  sandboxLogs: SandboxLogEntry[];
  sandboxError: string | null;
  isSkillReady: boolean;
  startSandbox: () => void;
  restartSandbox: () => void;
  saveAllRef: React.MutableRefObject<(() => Promise<void>) | undefined>;
};

export const SkillDetailContext = createContext<SkillDetailContextType>({
  skillId: '',
  skillDetail: undefined,
  isFetchingSkillDetail: false,
  refreshSkillDetail: () => {},
  currentTab: TabEnum.config,
  setCurrentTab: () => {},
  showHistories: false,
  setShowHistories: () => {},
  sandboxState: 'idle',
  sandboxLogs: [],
  sandboxError: null,
  isSkillReady: false,
  startSandbox: () => {},
  restartSandbox: () => {},
  saveAllRef: { current: undefined }
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
  const { skillId = '' } = router.query as { skillId: string };

  const [currentTab, setCurrentTab] = useState<TabEnum>(TabEnum.config);
  const [showHistories, setShowHistories] = useState(false);

  // Sandbox states
  const [sandboxState, setSandboxState] = useState<SandboxState>('idle');
  const [sandboxLogs, setSandboxLogs] = useState<SandboxLogEntry[]>([]);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);
  const saveAllRef = useRef<() => Promise<void>>();

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

  const startSandbox = useCallback(() => {
    if (!skillId) return;

    // Abort previous if any
    abortCtrlRef.current?.abort();

    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;

    setSandboxState('idle');
    setSandboxLogs([]);
    setSandboxError(null);

    let hasReceivedFirstEvent = false;

    streamCreateEditDebugSandbox({
      data: { skillId },
      onStatus: (status) => {
        // 收到第一条 SSE 消息后才从 idle 切到 loading（终端日志）
        if (!hasReceivedFirstEvent) {
          hasReceivedFirstEvent = true;
          setSandboxState('loading');
        }

        const entry: SandboxLogEntry = {
          timestamp: formatTimestamp(),
          message: phaseToMessage(status),
          phase: status.phase
        };
        setSandboxLogs((prev) => [...prev, entry]);

        if (status.phase === 'ready') {
          setSandboxState('ready');
        } else if (status.phase === 'failed') {
          setSandboxError(status.message || t('skill:sandbox_error_title'));
          setSandboxState('failed');
        }
      },
      onError: (err) => {
        setSandboxError(err);
        setSandboxState('failed');
      },
      abortCtrl
    }).catch((err) => {
      if (abortCtrl.signal.aborted) return;
      setSandboxError(typeof err === 'string' ? err : err?.message || String(err));
      setSandboxState('failed');
    });
  }, [skillId, phaseToMessage, t]);

  const restartSandbox = useCallback(() => {
    hasStartedRef.current = true;
    startSandbox();
  }, [startSandbox]);

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
  const visibleCurrentTab =
    (!isSkillReady || visibleSandboxState !== 'ready') && currentTab === TabEnum.preview
      ? TabEnum.config
      : currentTab;

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
      currentTab: visibleCurrentTab,
      setCurrentTab,
      showHistories,
      setShowHistories,
      sandboxState: visibleSandboxState,
      sandboxLogs,
      sandboxError: visibleSandboxError,
      isSkillReady,
      startSandbox,
      restartSandbox,
      saveAllRef
    }),
    [
      skillId,
      skillDetail,
      isFetchingSkillDetail,
      refreshSkillDetail,
      visibleCurrentTab,
      showHistories,
      visibleSandboxState,
      sandboxLogs,
      visibleSandboxError,
      isSkillReady,
      startSandbox,
      restartSandbox
    ]
  );

  return <SkillDetailContext.Provider value={contextValue}>{children}</SkillDetailContext.Provider>;
};

export default SkillDetailContextProvider;

import React, { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createContext } from 'use-context-selector';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import type { AgentSkillDetailType } from '@fastgpt/global/core/agentSkills/type';
import type { SandboxStatusItemType, SandboxStatusPhase } from '@fastgpt/global/core/chat/type';
import { AgentSkillTypeEnum } from '@fastgpt/global/core/agentSkills/constants';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { getSkillDetail, streamCreateEditDebugSandbox } from '@/web/core/skill/api';
import { SkillPermission } from '@fastgpt/global/support/permission/agentSkill/controller';

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
  sandboxEndpointUrl: string | null;
  sandboxError: string | null;
  startSandbox: () => void;
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
  sandboxEndpointUrl: null,
  sandboxError: null,
  startSandbox: () => {}
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
  const [sandboxEndpointUrl, setSandboxEndpointUrl] = useState<string | null>(null);
  const [sandboxError, setSandboxError] = useState<string | null>(null);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const hasStartedRef = useRef(false);

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
    setSandboxEndpointUrl(null);
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

        if (status.phase === 'ready' && status.providerSandboxId && status.endpoint?.port) {
          setSandboxEndpointUrl(`/proxy/${status.providerSandboxId}/${status.endpoint.port}/`);
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
          config: res.config ?? {},
          teamId: res.teamId ?? '',
          tmbId: res.tmbId ?? '',
          currentVersion: 0,
          versionCount: 0,
          createTime: new Date(res.createTime),
          updateTime: new Date(res.updateTime),
          appCount: res.appCount ?? 0,
          permission: new SkillPermission({ role: res.permission ?? 0 })
        };
        return detail;
      });
    },
    {
      manual: false,
      refreshDeps: [skillId]
    }
  );

  // Auto-start sandbox when skillId is ready
  useEffect(() => {
    if (skillId && !hasStartedRef.current) {
      hasStartedRef.current = true;
      startSandbox();
    }
  }, [skillId, startSandbox]);

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
      currentTab,
      setCurrentTab,
      showHistories,
      setShowHistories,
      sandboxState,
      sandboxLogs,
      sandboxEndpointUrl,
      sandboxError,
      startSandbox
    }),
    [
      skillId,
      skillDetail,
      isFetchingSkillDetail,
      refreshSkillDetail,
      currentTab,
      showHistories,
      sandboxState,
      sandboxLogs,
      sandboxEndpointUrl,
      sandboxError,
      startSandbox
    ]
  );

  return <SkillDetailContext.Provider value={contextValue}>{children}</SkillDetailContext.Provider>;
};

export default SkillDetailContextProvider;

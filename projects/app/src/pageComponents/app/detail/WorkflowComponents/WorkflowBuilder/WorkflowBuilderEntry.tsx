import React from 'react';
import { Box, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import WorkflowBuilderGuidePopover from './GuidePopover';
import { useWorkflowBuilderUI } from './context';
import WorkflowToolbarTooltip from './WorkflowToolbarTooltip';
import styles from './workflowBuilderEntry.module.scss';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import {
  getWorkflowBuilderAttentionKeys,
  getWorkflowBuilderEntryAccess,
  getWorkflowBuilderEntryVisualState,
  hasUnseenWorkflowBuilderAttention,
  useWorkflowBuilderVersionExpired
} from './uiState';

const WorkflowBuilderEntry = () => {
  const { t } = useTranslation('workflow');
  const feConfigs = useSystemStore((state) => state.feConfigs);
  const systemInitialized = useSystemStore((state) => state.initd);
  const appDetail = useContextSelector(AppContext, (value) => value.appDetail);
  const {
    activeLeftPanel,
    guideStep,
    activity,
    acknowledgedAttentionKeys,
    openLeftPanel,
    completeGuideStep,
    requestInputFocus
  } = useWorkflowBuilderUI();
  const isOpen = activeLeftPanel === 'workflowBuilder';
  const isLatestVersionExpired = useWorkflowBuilderVersionExpired(
    activity.latestVersion?.version.expiresAt
  );
  const pendingVersionChecksum =
    activity.latestVersion && !activity.latestVersion.version.appliedAt && !isLatestVersionExpired
      ? activity.latestVersion.version.checksum
      : undefined;
  const attentionKeys = getWorkflowBuilderAttentionKeys({
    pendingInteractiveKey: activity.pendingInteractiveKey,
    pendingVersionChecksum,
    errorAttentionKey: activity.errorAttentionKey
  });
  const { showGeneratingHalo, showAttentionDot } = getWorkflowBuilderEntryVisualState({
    isChatGenerating: activity.isChatGenerating,
    hasPendingAttention:
      !isOpen && hasUnseenWorkflowBuilderAttention({ attentionKeys, acknowledgedAttentionKeys })
  });
  const entryAccess = getWorkflowBuilderEntryAccess({
    systemInitialized,
    isPlus: !!feConfigs?.isPlus,
    showAgentSandbox: !!feConfigs.show_agent_sandbox,
    showWorkflowBuilder: feConfigs.show_workflow_builder !== false,
    canEdit: !!appDetail.permission?.hasWritePer
  });

  if (entryAccess === 'hidden') return null;

  const button = (
    <Box
      className={styles.entry}
      data-generating={showGeneratingHalo || undefined}
      data-attention={showAttentionDot || undefined}
    >
      <Box className={styles.glowBack} aria-hidden />
      <Box className={styles.glowFront} aria-hidden />
      <IconButton
        className={styles.button}
        aria-label={t('workflow_builder_entry_tooltip')}
        icon={
          <Box className={styles.iconBox}>
            <MyIcon name="core/app/aiGenerateFilled" boxSize="18px" />
          </Box>
        }
        onClick={() => {
          openLeftPanel('workflowBuilder');
          if (entryAccess === 'enabled') requestInputFocus();
        }}
      />
      <Box className={styles.attentionDot} aria-hidden />
    </Box>
  );

  return (
    <WorkflowBuilderGuidePopover
      isOpen={guideStep === 'workflowBuilder'}
      title={t('workflow_builder_guide_ai_title')}
      description={t('workflow_builder_guide_ai_description')}
      onConfirm={() => completeGuideStep('workflowBuilder')}
    >
      <Box>
        <WorkflowToolbarTooltip
          isDisabled={guideStep === 'workflowBuilder'}
          label={t('workflow_builder_entry_tooltip')}
        >
          {button}
        </WorkflowToolbarTooltip>
      </Box>
    </WorkflowBuilderGuidePopover>
  );
};

export default React.memo(WorkflowBuilderEntry);

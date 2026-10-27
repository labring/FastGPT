import React from 'react';
import { Box, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyIcon from '@fastgpt/web/components/common/Icon';
import WorkflowBuilderGuidePopover from './presentation/GuidePopover';
import { useWorkflowBuilderUI } from './hooks/useWorkflowBuilderUI';
import WorkflowToolbarTooltip from './presentation/WorkflowToolbarTooltip';
import styles from './workflowBuilderEntry.module.scss';

const WorkflowBuilderEntry = () => {
  const { t } = useTranslation('workflow');
  const {
    guideStep,
    openLeftPanel,
    completeGuideStep,
    requestInputFocus,
    entryAccess,
    showGeneratingHalo,
    showAttentionDot
  } = useWorkflowBuilderUI();

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
    <>
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
      <Box w={'20px'} h={'1px'} flexShrink={0} bg={'#E8EBF0'} />
    </>
  );
};

export default React.memo(WorkflowBuilderEntry);

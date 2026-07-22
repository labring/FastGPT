import React from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { SkillDetailContext } from './context';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import SandboxError from './config/SandboxError';
import { RightHeader } from '@/pageComponents/dashboard/skill/detail/Header';
import SandboxRuntimeUpgradeModal from '@/components/core/ai/SandboxRuntimeUpgradeModal';

const EDIT_DEBUG_CHAT_ID = 'edit-debug';

const Content = () => {
  const { t } = useTranslation();
  const router = useRouter();
  const {
    sandboxState,
    skillId,
    isSkillReady,
    handleSandboxError,
    upgradeSandboxRuntime,
    sandboxError
  } = useContextSelector(SkillDetailContext, (v) => ({
    sandboxState: v.sandboxState,
    skillId: v.skillId,
    isSkillReady: v.isSkillReady,
    handleSandboxError: v.handleSandboxError,
    upgradeSandboxRuntime: v.upgradeSandboxRuntime,
    sandboxError: v.sandboxError
  }));
  const isSandboxReady = sandboxState === 'ready';
  const isUpgrading = sandboxState === 'upgrading';
  const isUpgradeModalOpen = sandboxState === 'upgradeRequired' || isUpgrading;
  const upgradeModalTitle = isUpgrading
    ? t('skill:sandbox_runtime_upgrade_in_progress')
    : t('skill:sandbox_runtime_upgrade_required');
  const canOperateSandbox = isSkillReady && isSandboxReady;

  return (
    <Box
      flex={1}
      h={'100%'}
      display={'flex'}
      flexDirection={'column'}
      overflow={'hidden'}
      pt={'16px'}
      pb={'16px'}
      pr={'16px'}
      pl={0}
    >
      {sandboxState === 'failed' ? (
        <SandboxError />
      ) : (
        <SandboxEditor
          chatTarget={{ skillId }}
          chatId={EDIT_DEBUG_CHAT_ID}
          showFileOps={true}
          showDownload={false}
          showFileTreeDownload={true}
          defaultViewMode={'source'}
          isPreparing={!isSandboxReady}
          showTerminal={true}
          enablePathCopy={true}
          enableZipExtract={true}
          enableMultiSelect={true}
          onError={(err) => handleSandboxError(err.message)}
          headerRight={canOperateSandbox ? <RightHeader /> : undefined}
        />
      )}
      <SandboxRuntimeUpgradeModal
        isOpen={isUpgradeModalOpen}
        isUpgrading={isUpgrading}
        title={upgradeModalTitle}
        description={t('skill:sandbox_runtime_upgrade_desc')}
        confirmText={t('skill:sandbox_runtime_upgrade_confirm')}
        secondaryText={t('common:Exit')}
        error={sandboxError ?? undefined}
        onUpgrade={upgradeSandboxRuntime}
        onClose={() => router.back()}
      />
    </Box>
  );
};

export default React.memo(Content);

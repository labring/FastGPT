import React from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { SkillDetailContext } from './context';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import SandboxError from './config/SandboxError';
import { RightHeader } from '@/pageComponents/dashboard/skill/detail/Header';
import ProModal from '@/components/ProTip/ProModal';

const EDIT_DEBUG_CHAT_ID = 'edit-debug';

const Content = () => {
  const { t } = useTranslation();
  const { sandboxState, skillId, isSkillReady, handleSandboxError, upgradeSandboxRuntime } =
    useContextSelector(SkillDetailContext, (v) => ({
      sandboxState: v.sandboxState,
      skillId: v.skillId,
      isSkillReady: v.isSkillReady,
      handleSandboxError: v.handleSandboxError,
      upgradeSandboxRuntime: v.upgradeSandboxRuntime
    }));
  const isSandboxReady = sandboxState === 'ready';
  const isUpgrading = sandboxState === 'upgrading';
  const isUpgradeModalOpen = sandboxState === 'upgradeRequired';
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
      <ProModal
        isOpen={isUpgradeModalOpen}
        forceShow
        title={t('skill:sandbox_runtime_upgrade_required')}
        content={
          <Box color={'myGray.900'} fontSize={'18px'} lineHeight={'26px'} mt={7}>
            {t('skill:sandbox_runtime_upgrade_desc')}
          </Box>
        }
        primaryButtonText={t('skill:sandbox_runtime_upgrade_confirm')}
        primaryButtonLoading={isUpgrading}
        onPrimaryClick={upgradeSandboxRuntime}
        showSecondaryButton={false}
      />
    </Box>
  );
};

export default React.memo(Content);

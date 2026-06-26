import React from 'react';
import { Box, Button } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { SkillDetailContext } from './context';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import SandboxError from './config/SandboxError';
import { RightHeader } from '@/pageComponents/dashboard/skill/detail/Header';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';

const EDIT_DEBUG_CHAT_ID = 'edit-debug';

const Content = () => {
  const { t } = useTranslation();
  const {
    sandboxState,
    skillId,
    isSkillReady,
    isUpgradeModalOpen,
    handleSandboxError,
    upgradeSandboxRuntime
  } = useContextSelector(SkillDetailContext, (v) => ({
    sandboxState: v.sandboxState,
    skillId: v.skillId,
    isSkillReady: v.isSkillReady,
    isUpgradeModalOpen: v.isUpgradeModalOpen,
    handleSandboxError: v.handleSandboxError,
    upgradeSandboxRuntime: v.upgradeSandboxRuntime
  }));
  const isSandboxReady = sandboxState === 'ready';
  const isUpgrading = sandboxState === 'upgrading';
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
          defaultViewMode={'source'}
          isPreparing={!isSandboxReady}
          showTerminal={true}
          onError={(err) => handleSandboxError(err.message)}
          headerRight={canOperateSandbox ? <RightHeader /> : undefined}
        />
      )}
      <MyModal
        isOpen={isUpgradeModalOpen}
        title={t('skill:sandbox_runtime_upgrade_required')}
        size={'md'}
        isCentered
        closeOnOverlayClick={false}
        showCloseButton={false}
        footer={
          <Button isLoading={isUpgrading} onClick={upgradeSandboxRuntime}>
            {t('skill:sandbox_runtime_upgrade_confirm')}
          </Button>
        }
      >
        <Box color={'myGray.600'}>{t('skill:sandbox_runtime_upgrade_desc')}</Box>
      </MyModal>
    </Box>
  );
};

export default React.memo(Content);

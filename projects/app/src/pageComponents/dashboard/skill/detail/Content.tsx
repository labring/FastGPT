import React from 'react';
import { Box, Button, VStack } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { SkillDetailContext } from './context';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import SandboxError from './config/SandboxError';
import { RightHeader } from '@/pageComponents/dashboard/skill/detail/Header';
import HighlightModal from '@fastgpt/web/components/v2/common/MyModal/HighlightModal';

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
    canUpgradeSandboxRuntime
  } = useContextSelector(SkillDetailContext, (v) => ({
    sandboxState: v.sandboxState,
    skillId: v.skillId,
    isSkillReady: v.isSkillReady,
    handleSandboxError: v.handleSandboxError,
    upgradeSandboxRuntime: v.upgradeSandboxRuntime,
    canUpgradeSandboxRuntime: v.canUpgradeSandboxRuntime
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
      <HighlightModal
        isOpen={isUpgradeModalOpen}
        title={upgradeModalTitle}
        footer={
          <VStack w={'full'} gap={3}>
            <Button
              w={'full'}
              h={'48px'}
              borderRadius={'10px'}
              onClick={upgradeSandboxRuntime}
              isLoading={isUpgrading}
              isDisabled={isUpgrading || !canUpgradeSandboxRuntime}
              fontSize={'16px'}
              fontWeight={'medium'}
            >
              {t('skill:sandbox_runtime_upgrade_confirm')}
            </Button>
            <Button
              w={'full'}
              h={'48px'}
              borderRadius={'10px'}
              variant={'whitePrimary'}
              onClick={() => router.back()}
              fontSize={'16px'}
              fontWeight={'medium'}
            >
              {t('common:Exit')}
            </Button>
          </VStack>
        }
      >
        <Box
          color={'myGray.900'}
          fontSize={'18px'}
          lineHeight={'26px'}
          mt={7}
          whiteSpace="pre-wrap"
        >
          {t('skill:sandbox_runtime_upgrade_desc')}
        </Box>
      </HighlightModal>
    </Box>
  );
};

export default React.memo(Content);

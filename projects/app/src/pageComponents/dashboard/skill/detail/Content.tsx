import React from 'react';
import { Box, Button, VStack } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { useTranslation } from 'next-i18next';
import { useRouter } from 'next/router';
import { SkillDetailContext } from './context';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import SandboxError from './config/SandboxError';
import { RightHeader } from '@/pageComponents/dashboard/skill/detail/Header';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import runtimeUpgradeModalBg from '@/assets/skill/runtimeUpgradeModalBg.jpg';

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
    canUpgradeSandboxRuntime,
    sandboxError
  } = useContextSelector(SkillDetailContext, (v) => ({
    sandboxState: v.sandboxState,
    skillId: v.skillId,
    isSkillReady: v.isSkillReady,
    handleSandboxError: v.handleSandboxError,
    upgradeSandboxRuntime: v.upgradeSandboxRuntime,
    canUpgradeSandboxRuntime: v.canUpgradeSandboxRuntime,
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
      <MyModal
        isOpen={isUpgradeModalOpen}
        onClose={() => router.back()}
        showCloseButton
        isCentered
        size={'sm'}
        borderRadius={'md'}
        overflow={'hidden'}
        bodyStyles={{
          p: 0,
          overflowX: 'hidden',
          overflowY: 'auto'
        }}
      >
        <Box p={2} pb={0}>
          <Box
            aspectRatio={384 / 223}
            borderRadius={'xs'}
            bgImage={`url(${runtimeUpgradeModalBg.src})`}
            bgSize={'cover'}
            bgPosition={'center'}
            bgRepeat={'no-repeat'}
          />
        </Box>

        <VStack px={8} pt={6} pb={8} gap={0} textAlign={'center'} alignItems={'center'}>
          <Box color={'myGray.900'} fontSize={'lg'} fontWeight={'semibold'} lineHeight={'26px'}>
            {upgradeModalTitle}
          </Box>
          <Box
            color={'myGray.900'}
            fontSize={'sm'}
            lineHeight={'20px'}
            mt={6}
            whiteSpace="pre-wrap"
          >
            {t('skill:sandbox_runtime_upgrade_desc')}
          </Box>
          {sandboxError && (
            <Box
              color={'red.600'}
              fontSize={'sm'}
              lineHeight={'20px'}
              mt={3}
              whiteSpace="pre-wrap"
            >
              {sandboxError}
            </Box>
          )}
          <VStack w={'full'} gap={3} mt={6}>
            <Button
              w={'full'}
              size={'lg'}
              onClick={upgradeSandboxRuntime}
              isLoading={isUpgrading}
              isDisabled={isUpgrading || !canUpgradeSandboxRuntime}
              fontSize={'sm'}
            >
              {t('skill:sandbox_runtime_upgrade_confirm')}
            </Button>
            <Button
              w={'full'}
              size={'lg'}
              variant={'whitePrimary'}
              onClick={() => router.back()}
              fontSize={'sm'}
            >
              {t('common:Exit')}
            </Button>
          </VStack>
        </VStack>
      </MyModal>
    </Box>
  );
};

export default React.memo(Content);

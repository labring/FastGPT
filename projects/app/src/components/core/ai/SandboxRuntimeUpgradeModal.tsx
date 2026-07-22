import React from 'react';
import { Box, Button, VStack } from '@chakra-ui/react';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import runtimeUpgradeModalBg from '@/assets/skill/runtimeUpgradeModalBg.jpg';

type Props = {
  isOpen: boolean;
  isUpgrading: boolean;
  title: string;
  description: string;
  confirmText: string;
  secondaryText: string;
  error?: string;
  onUpgrade: () => void;
  onClose: () => void;
};

/** App Chat 与 Skill Edit 共用的 Sandbox runtime 镜像升级弹窗。 */
const SandboxRuntimeUpgradeModal = ({
  isOpen,
  isUpgrading,
  title,
  description,
  confirmText,
  secondaryText,
  error,
  onUpgrade,
  onClose
}: Props) => (
  <MyModal
    isOpen={isOpen}
    onClose={onClose}
    showCloseButton={false}
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
        {title}
      </Box>
      <Box color={'myGray.900'} fontSize={'sm'} lineHeight={'20px'} mt={6} whiteSpace={'pre-wrap'}>
        {description}
      </Box>
      {error && (
        <Box color={'red.600'} fontSize={'sm'} lineHeight={'20px'} mt={3} whiteSpace={'pre-wrap'}>
          {error}
        </Box>
      )}
      <VStack w={'full'} gap={3} mt={6}>
        <Button
          w={'full'}
          size={'lg'}
          onClick={onUpgrade}
          isLoading={isUpgrading}
          isDisabled={isUpgrading}
          fontSize={'sm'}
        >
          {confirmText}
        </Button>
        <Button w={'full'} size={'lg'} variant={'whitePrimary'} onClick={onClose} fontSize={'sm'}>
          {secondaryText}
        </Button>
      </VStack>
    </VStack>
  </MyModal>
);

export default React.memo(SandboxRuntimeUpgradeModal);

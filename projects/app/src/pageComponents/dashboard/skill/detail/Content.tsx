import React from 'react';
import { Flex, Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext, TabEnum } from './context';
import BuildingAnimation from './config/BuildingAnimation';
import SandboxTerminal from './config/SandboxTerminal';
import SandboxIframe from './config/SandboxIframe';
import SandboxError from './config/SandboxError';
import SkillPreview from './preview/SkillPreview';

const SkillBuilding = () => {
  const { t } = useTranslation();

  return (
    <Flex h={'100%'} alignItems={'center'} justifyContent={'center'} flexDirection={'column'}>
      <BuildingAnimation />
      <Box mt={'20px'} color={'myGray.500'} fontSize={'sm'}>
        {t('skill:generating')}
      </Box>
    </Flex>
  );
};

const Content = () => {
  const { currentTab, sandboxState } = useContextSelector(SkillDetailContext, (v) => ({
    currentTab: v.currentTab,
    sandboxState: v.sandboxState
  }));

  return (
    <Box
      flex={1}
      bg={'white'}
      borderRadius={'8px'}
      border={'1px solid #EBEDF0'}
      overflow={'hidden'}
    >
      <Box h={'100%'} display={currentTab === TabEnum.config ? 'block' : 'none'}>
        {sandboxState === 'idle' && <SkillBuilding />}
        {sandboxState === 'loading' && <SandboxTerminal />}
        {sandboxState === 'ready' && <SandboxIframe />}
        {sandboxState === 'failed' && <SandboxError />}
      </Box>
      <Box h={'100%'} display={currentTab === TabEnum.preview ? 'block' : 'none'}>
        <SkillPreview />
      </Box>
    </Box>
  );
};

export default React.memo(Content);

import React from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext, TabEnum } from './context';
import SandboxTerminal from './config/SandboxTerminal';
import SandboxIframe from './config/SandboxIframe';
import SandboxError from './config/SandboxError';
import SkillPreview from './preview/SkillPreview';
import Loading from '@fastgpt/web/components/common/MyLoading';

const Content = () => {
  const { t } = useTranslation();
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
      <Box
        h={'100%'}
        position={'relative'}
        display={currentTab === TabEnum.config ? 'block' : 'none'}
      >
        {sandboxState === 'idle' && (
          <Loading fixed={false} text={t('skill:generating')} bg={'white'} variant={'particle'} />
        )}
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

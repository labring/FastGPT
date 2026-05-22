import React from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext, TabEnum } from './context';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import SandboxError from './config/SandboxError';
import SkillPreview from './preview/SkillPreview';

const Content = () => {
  const { t } = useTranslation();
  const { currentTab, sandboxState, skillId } = useContextSelector(SkillDetailContext, (v) => ({
    currentTab: v.currentTab,
    sandboxState: v.sandboxState,
    skillId: v.skillId
  }));

  return (
    <Box
      flex={1}
      minH={0}
      display={'flex'}
      flexDirection={'column'}
      bg={'white'}
      borderRadius={'12px'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      overflow={'hidden'}
    >
      <Box
        flex={1}
        minH={0}
        position={'relative'}
        display={currentTab === TabEnum.config ? 'flex' : 'none'}
        flexDirection={'column'}
      >
        {sandboxState === 'failed' ? (
          <SandboxError />
        ) : (
          <SandboxEditor
            appId={skillId}
            chatId={'edit-debug'}
            showFileOps={true}
            showDownload={false}
            defaultViewMode={'source'}
            isPreparing={sandboxState !== 'ready'}
            preparingText={t('skill:generating')}
          />
        )}
      </Box>
      <Box
        flex={1}
        minH={0}
        display={currentTab === TabEnum.preview ? 'flex' : 'none'}
        flexDirection={'column'}
      >
        <SkillPreview />
      </Box>
    </Box>
  );
};

export default React.memo(Content);

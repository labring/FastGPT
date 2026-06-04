import React from 'react';
import { Box } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from './context';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import SandboxError from './config/SandboxError';
import { RightHeader } from '@/pageComponents/dashboard/skill/detail/Header';

const Content = () => {
  const { t } = useTranslation();
  const { sandboxState, skillId, handleSandboxError } = useContextSelector(
    SkillDetailContext,
    (v) => ({
      sandboxState: v.sandboxState,
      skillId: v.skillId,
      handleSandboxError: v.handleSandboxError
    })
  );

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
      pl={'8px'}
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
          showTerminal={true}
          onError={(err) => handleSandboxError(err.message)}
          headerRight={<RightHeader />}
        />
      )}
    </Box>
  );
};

export default React.memo(Content);

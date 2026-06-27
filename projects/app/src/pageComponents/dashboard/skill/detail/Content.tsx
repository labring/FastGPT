import React from 'react';
import { Box } from '@chakra-ui/react';
import { useContextSelector } from 'use-context-selector';
import { SkillDetailContext } from './context';
import SandboxEditor from '@/pageComponents/chat/SandboxEditor/Editor';
import SandboxError from './config/SandboxError';
import { RightHeader } from '@/pageComponents/dashboard/skill/detail/Header';

const EDIT_DEBUG_CHAT_ID = 'edit-debug';

const Content = () => {
  const { sandboxState, skillId, isSkillReady, handleSandboxError } = useContextSelector(
    SkillDetailContext,
    (v) => ({
      sandboxState: v.sandboxState,
      skillId: v.skillId,
      isSkillReady: v.isSkillReady,
      handleSandboxError: v.handleSandboxError
    })
  );
  const isSandboxReady = sandboxState === 'ready';
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
    </Box>
  );
};

export default React.memo(Content);

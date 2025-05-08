import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { useSafeState } from 'ahooks';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useChatGate } from '../useChatGate';
import { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { cardStyles } from '../constants';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import VariablePopover from '@/components/core/chat/ChatContainer/ChatBox/components/VariablePopover';

type Props = {
  appForm: AppSimpleEditFormType;
  setRenderEdit: React.Dispatch<React.SetStateAction<boolean>>;
};
const ChatGate = ({ appForm, setRenderEdit }: Props) => {
  const { t } = useTranslation();

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const quoteData = useContextSelector(ChatItemContext, (v) => v.quoteData);
  const setQuoteData = useContextSelector(ChatItemContext, (v) => v.setQuoteData);
  // form2AppWorkflow dependent allDatasets
  const isVariableVisible = useContextSelector(ChatItemContext, (v) => v.isVariableVisible);

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });

  useEffect(() => {
    const { nodes, edges } = form2AppWorkflow(appForm, t);
    setWorkflowData({ nodes, edges });
  }, [appForm, setWorkflowData, t]);

  useEffect(() => {
    setRenderEdit(!quoteData);
  }, [quoteData, setRenderEdit]);

  const { ChatContainer, restartChat, loading } = useChatGate({
    ...workflowData,
    chatConfig: appForm.chatConfig,
    isReady: true
  });

  return (
    <Flex h={'full'} gap={2}>
      <MyBox
        flex={'1 0 0'}
        w={0}
        display={'flex'}
        position={'relative'}
        flexDirection={'column'}
        h={'full'}
        py={4}
        {...cardStyles}
        boxShadow={'3'}
      >
        <Box flex={1}>
          <ChatContainer />
        </Box>
      </MyBox>
      {quoteData && (
        <Box flex={'1 0 0'} w={0} maxW={'560px'} {...cardStyles} boxShadow={'3'}>
          <ChatQuoteList
            rawSearch={quoteData.rawSearch}
            metadata={quoteData.metadata}
            onClose={() => setQuoteData(undefined)}
          />
        </Box>
      )}
    </Flex>
  );
};

export default React.memo(ChatGate);

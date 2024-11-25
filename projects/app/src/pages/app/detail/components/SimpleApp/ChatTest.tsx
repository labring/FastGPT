import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { useSafeState } from 'ahooks';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { useI18n } from '@/web/context/I18n';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../context';
import { useChatTest } from '../useChatTest';
import { useDatasetStore } from '@/web/core/dataset/store/dataset';
import ChatItemContextProvider from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';

type Props = { appForm: AppSimpleEditFormType };
const ChatTest = ({ appForm }: Props) => {
  const { t } = useTranslation();
  const { appT } = useI18n();

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  // form2AppWorkflow dependent allDatasets
  const { allDatasets } = useDatasetStore();

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });

  useEffect(() => {
    const { nodes, edges } = form2AppWorkflow(appForm, t);
    // console.log(form2AppWorkflow(appForm, t));
    setWorkflowData({ nodes, edges });
  }, [appForm, setWorkflowData, allDatasets, t]);

  const { ChatContainer, restartChat, loading } = useChatTest({
    ...workflowData,
    chatConfig: appForm.chatConfig,
    isReady: true
  });

  return (
    <MyBox
      isLoading={loading}
      display={'flex'}
      position={'relative'}
      flexDirection={'column'}
      h={'100%'}
      py={4}
    >
      <Flex px={[2, 5]}>
        <Box fontSize={['md', 'lg']} fontWeight={'bold'} flex={1} color={'myGray.900'}>
          {appT('chat_debug')}
        </Box>
        <MyTooltip label={t('common:core.chat.Restart')}>
          <IconButton
            className="chat"
            size={'smSquare'}
            icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
            variant={'whiteDanger'}
            borderRadius={'md'}
            aria-label={'delete'}
            onClick={(e) => {
              e.stopPropagation();
              restartChat();
            }}
          />
        </MyTooltip>
      </Flex>
      <Box flex={1}>
        <ChatContainer />
      </Box>
    </MyBox>
  );
};

const Render = ({ appForm }: Props) => {
  const { chatId } = useChatStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const chatRecordProviderParams = useMemo(
    () => ({
      chatId: chatId,
      appId: appDetail._id
    }),
    [appDetail._id, chatId]
  );

  return (
    <ChatItemContextProvider>
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest appForm={appForm} />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);

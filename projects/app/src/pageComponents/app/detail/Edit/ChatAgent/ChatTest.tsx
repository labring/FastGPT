import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useEffect, useMemo } from 'react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';

import { useSafeState } from 'ahooks';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/type';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '../../context';
import { useChatTest } from '../../useChatTest';
import ChatItemContextProvider, { ChatItemContext } from '@/web/core/chat/context/chatItemContext';
import ChatRecordContextProvider from '@/web/core/chat/context/chatRecordContext';
import { useChatStore } from '@/web/core/chat/context/useChatStore';
import MyBox from '@fastgpt/web/components/common/MyBox';
import { cardStyles } from '../../constants';
import ChatQuoteList from '@/pageComponents/chat/ChatQuoteList';
import VariablePopover from '@/components/core/chat/ChatContainer/components/VariablePopover';
import { ChatTypeEnum } from '@/components/core/chat/ChatContainer/ChatBox/constants';
import type { Form2WorkflowFnType } from '../FormComponent/type';
import FillRowTabs from '@fastgpt/web/components/common/Tabs/FillRowTabs';
import HelperBot from '@/components/core/chat/HelperBot';
import { HelperBotTypeEnum } from '@fastgpt/global/core/chat/helperBot/type';

type Props = {
  appForm: AppFormEditFormType;
  setRenderEdit: React.Dispatch<React.SetStateAction<boolean>>;
  form2WorkflowFn: Form2WorkflowFnType;
};
const ChatTest = ({ appForm, setRenderEdit, form2WorkflowFn }: Props) => {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useSafeState<'helper' | 'chat_debug'>('helper');

  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const datasetCiteData = useContextSelector(ChatItemContext, (v) => v.datasetCiteData);
  const setCiteModalData = useContextSelector(ChatItemContext, (v) => v.setCiteModalData);
  // agentForm2AppWorkflow dependent allDatasets
  const isVariableVisible = useContextSelector(ChatItemContext, (v) => v.isVariableVisible);

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });

  useEffect(() => {
    const { nodes, edges } = form2WorkflowFn(appForm, t);
    setWorkflowData({ nodes, edges });
  }, [appForm, setWorkflowData, t]);

  useEffect(() => {
    setRenderEdit(!datasetCiteData);
  }, [datasetCiteData, setRenderEdit]);

  const { ChatContainer, restartChat } = useChatTest({
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
        <Flex px={[2, 5]} pb={2}>
          <FillRowTabs<'helper' | 'chat_debug'>
            py={1}
            list={[
              {
                label: '辅助生成',
                value: 'helper'
              },
              {
                label: t('app:chat_debug'),
                value: 'chat_debug'
              }
            ]}
            value={activeTab}
            onChange={(value) => {
              setActiveTab(value);
            }}
          />
          {!isVariableVisible && activeTab === 'chat_debug' && (
            <VariablePopover chatType={ChatTypeEnum.test} />
          )}
          <Box flex={1} />
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
          {activeTab === 'helper' && (
            <HelperBot type={HelperBotTypeEnum.topAgent} metadata={{}} onApply={() => {}} />
          )}
          {activeTab === 'chat_debug' && <ChatContainer />}
        </Box>
      </MyBox>
      {datasetCiteData && (
        <Box flex={'1 0 0'} w={0} maxW={'560px'} {...cardStyles} boxShadow={'3'}>
          <ChatQuoteList
            rawSearch={datasetCiteData.rawSearch}
            metadata={datasetCiteData.metadata}
            onClose={() => setCiteModalData(undefined)}
          />
        </Box>
      )}
    </Flex>
  );
};

const Render = ({ appForm, setRenderEdit, form2WorkflowFn }: Props) => {
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
    <ChatItemContextProvider
      showRouteToDatasetDetail={true}
      isShowReadRawSource={true}
      isResponseDetail={true}
      showNodeStatus
    >
      <ChatRecordContextProvider params={chatRecordProviderParams}>
        <ChatTest
          appForm={appForm}
          setRenderEdit={setRenderEdit}
          form2WorkflowFn={form2WorkflowFn}
        />
      </ChatRecordContextProvider>
    </ChatItemContextProvider>
  );
};

export default React.memo(Render);

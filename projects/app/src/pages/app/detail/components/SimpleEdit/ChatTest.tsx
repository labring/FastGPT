import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useRef } from 'react';
import ChatBox from '@/components/ChatBox';
import type { ComponentRef, StartChatFnProps } from '@/components/ChatBox/type.d';
import { streamFetch } from '@/web/common/api/fetch';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { checkChatSupportSelectFileByModules } from '@/web/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getDefaultEntryNodeIds,
  getMaxHistoryLimitFromNodes,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { useMemoizedFn, useSafeState } from 'ahooks';
import { UseFormReturn } from 'react-hook-form';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { form2AppWorkflow } from '@/web/core/app/utils';
import { useI18n } from '@/web/context/I18n';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/web/core/app/context/appContext';

const ChatTest = ({
  editForm,
  appId
}: {
  editForm: UseFormReturn<AppSimpleEditFormType, any>;
  appId: string;
}) => {
  const { t } = useTranslation();
  const { appT } = useI18n();

  const { userInfo } = useUserStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const { watch } = editForm;
  const chatConfig = watch('chatConfig');

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });

  const startChat = useMemoizedFn(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      if (!workflowData) return Promise.reject('workflowData is empty');

      /* get histories */
      let historyMaxLen = getMaxHistoryLimitFromNodes(workflowData.nodes);

      const history = chatList.slice(-historyMaxLen - 2, -2);

      // 流请求，获取数据
      const { responseText, responseData } = await streamFetch({
        url: '/api/core/chat/chatTest',
        data: {
          history,
          prompt: chatList[chatList.length - 2].value,
          nodes: storeNodes2RuntimeNodes(
            workflowData.nodes,
            getDefaultEntryNodeIds(workflowData.nodes)
          ),
          edges: initWorkflowEdgeStatus(workflowData.edges),
          variables,
          appId,
          appName: `调试-${appDetail.name}`
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      return { responseText, responseData };
    }
  );

  const resetChatBox = useCallback(() => {
    ChatBoxRef.current?.resetHistory([]);
    ChatBoxRef.current?.resetVariables();
  }, []);

  useEffect(() => {
    const wat = watch((data) => {
      const { nodes, edges } = form2AppWorkflow(data as AppSimpleEditFormType);
      setWorkflowData({ nodes, edges });
    });

    return () => {
      wat.unsubscribe();
    };
  }, [setWorkflowData, watch]);

  return (
    <Flex
      position={'relative'}
      flexDirection={'column'}
      h={'100%'}
      py={4}
      overflowX={'auto'}
      bg={'white'}
    >
      <Flex px={[2, 5]}>
        <Box fontSize={['md', 'lg']} fontWeight={'bold'} flex={1}>
          {appT('Chat Debug')}
        </Box>
        <MyTooltip label={t('core.chat.Restart')}>
          <IconButton
            className="chat"
            size={'smSquare'}
            icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
            variant={'whiteDanger'}
            borderRadius={'md'}
            aria-label={'delete'}
            onClick={(e) => {
              e.stopPropagation();
              resetChatBox();
            }}
          />
        </MyTooltip>
      </Flex>
      <Box flex={1}>
        <ChatBox
          ref={ChatBoxRef}
          appId={appDetail._id}
          appAvatar={appDetail.avatar}
          userAvatar={userInfo?.avatar}
          showMarkIcon
          chatConfig={chatConfig}
          showFileSelector={checkChatSupportSelectFileByModules(workflowData.nodes)}
          onStartChat={startChat}
          onDelMessage={() => {}}
        />
      </Box>
      {appDetail.type !== AppTypeEnum.simple && (
        <Flex
          position={'absolute'}
          top={0}
          right={0}
          left={0}
          bottom={0}
          bg={'rgba(255,255,255,0.7)'}
          alignItems={'center'}
          justifyContent={'center'}
          flexDirection={'column'}
          fontSize={'lg'}
          color={'black'}
          whiteSpace={'pre-wrap'}
          textAlign={'center'}
        >
          <Box fontSize={'md'}>{appT('Advance App TestTip')}</Box>
        </Flex>
      )}
    </Flex>
  );
};

export default React.memo(ChatTest);

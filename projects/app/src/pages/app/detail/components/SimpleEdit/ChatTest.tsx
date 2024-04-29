import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useRef } from 'react';
import ChatBox from '@/components/ChatBox';
import type { ComponentRef, StartChatFnProps } from '@/components/ChatBox/type.d';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { streamFetch } from '@/web/common/api/fetch';
import MyTooltip from '@/components/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getGuideModule } from '@fastgpt/global/core/workflow/utils';
import { checkChatSupportSelectFileByModules } from '@/web/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  getDefaultEntryNodeIds,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { useCreation, useMemoizedFn, useSafeState } from 'ahooks';
import { UseFormReturn } from 'react-hook-form';
import { AppSimpleEditFormType } from '@fastgpt/global/core/app/type';
import { useAppStore } from '@/web/core/app/store/useAppStore';
import { form2AppWorkflow } from '@/web/core/app/utils';

const ChatTest = ({
  editForm,
  appId
}: {
  editForm: UseFormReturn<AppSimpleEditFormType, any>;
  appId: string;
}) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const { appDetail } = useAppStore();

  const { watch } = editForm;

  const [workflowData, setWorkflowData] = useSafeState({
    nodes: appDetail.modules || [],
    edges: appDetail.edges || []
  });
  const userGuideModule = useCreation(
    () => getGuideModule(workflowData.nodes),
    [workflowData.nodes]
  );

  const startChat = useMemoizedFn(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      if (!workflowData) return Promise.reject('workflowData is empty');

      /* get histories */
      let historyMaxLen = 6;
      workflowData?.nodes.forEach((node) => {
        node.inputs.forEach((input) => {
          if (
            (input.key === NodeInputKeyEnum.history ||
              input.key === NodeInputKeyEnum.historyMaxAmount) &&
            typeof input.value === 'number'
          ) {
            historyMaxLen = Math.max(historyMaxLen, input.value);
          }
        });
      });
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
  }, []);

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
        <Box fontSize={['md', 'xl']} fontWeight={'bold'} flex={1}>
          {t('app.Chat Debug')}
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
          userGuideModule={userGuideModule}
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
          <Box>{t('app.Advance App TestTip')}</Box>
        </Flex>
      )}
    </Flex>
  );
};

export default React.memo(ChatTest);

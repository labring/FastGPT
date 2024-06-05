import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import React, {
  useMemo,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
  ForwardedRef
} from 'react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { streamFetch } from '@/web/common/api/fetch';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useUserStore } from '@/web/support/user/useUserStore';
import ChatBox from '@/components/ChatBox';
import type { ComponentRef, StartChatFnProps } from '@/components/ChatBox/type.d';
import {
  checkChatSupportSelectFileByModules,
  getAppQuestionGuidesByModules
} from '@/web/core/chat/utils';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';
import {
  getDefaultEntryNodeIds,
  getMaxHistoryLimitFromNodes,
  initWorkflowEdgeStatus,
  storeNodes2RuntimeNodes
} from '@fastgpt/global/core/workflow/runtime/utils';
import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/web/core/app/context/appContext';

export type ChatTestComponentRef = {
  resetChatTest: () => void;
};

const ChatTest = (
  {
    isOpen,
    nodes = [],
    edges = [],
    onClose
  }: {
    isOpen: boolean;
    nodes?: StoreNodeItemType[];
    edges?: StoreEdgeItemType[];
    onClose: () => void;
  },
  ref: ForwardedRef<ChatTestComponentRef>
) => {
  const { t } = useTranslation();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const { userInfo } = useUserStore();
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const startChat = useCallback(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      /* get histories */
      let historyMaxLen = getMaxHistoryLimitFromNodes(nodes);
      const history = chatList.slice(-historyMaxLen - 2, -2);

      // 流请求，获取数据
      const { responseText, responseData } = await streamFetch({
        url: '/api/core/chat/chatTest',
        data: {
          history,
          prompt: chatList[chatList.length - 2].value,
          nodes: storeNodes2RuntimeNodes(nodes, getDefaultEntryNodeIds(nodes)),
          edges: initWorkflowEdgeStatus(edges),
          variables,
          appId: appDetail._id,
          appName: `调试-${appDetail.name}`,
          mode: 'test'
        },
        onMessage: generatingMessage,
        abortCtrl: controller
      });

      return { responseText, responseData };
    },
    [appDetail._id, appDetail.name, edges, nodes]
  );

  useImperativeHandle(ref, () => ({
    resetChatTest() {
      ChatBoxRef.current?.resetHistory([]);
      ChatBoxRef.current?.resetVariables();
    }
  }));

  return (
    <>
      <Flex
        zIndex={101}
        flexDirection={'column'}
        position={'absolute'}
        top={5}
        right={0}
        h={isOpen ? '95%' : '0'}
        w={isOpen ? ['100%', '460px'] : '0'}
        bg={'white'}
        boxShadow={'3px 0 20px rgba(0,0,0,0.2)'}
        borderRadius={'md'}
        overflow={'hidden'}
        transition={'.2s ease'}
      >
        <Flex py={4} px={5} whiteSpace={'nowrap'}>
          <Box fontSize={'lg'} fontWeight={'bold'} flex={1}>
            {t('core.chat.Debug test')}
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
                ChatBoxRef.current?.resetHistory([]);
                ChatBoxRef.current?.resetVariables();
              }}
            />
          </MyTooltip>
          <MyTooltip label={t('common.Close')}>
            <IconButton
              ml={[3, 6]}
              icon={<SmallCloseIcon fontSize={'22px'} />}
              variant={'grayBase'}
              size={'smSquare'}
              aria-label={''}
              onClick={onClose}
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
            chatConfig={appDetail.chatConfig}
            showFileSelector={checkChatSupportSelectFileByModules(nodes)}
            onStartChat={startChat}
            onDelMessage={() => {}}
          />
        </Box>
      </Flex>
      <Box
        zIndex={2}
        display={isOpen ? 'block' : 'none'}
        position={'fixed'}
        top={0}
        left={0}
        bottom={0}
        right={0}
        onClick={onClose}
      />
    </>
  );
};

export default React.memo(forwardRef(ChatTest));

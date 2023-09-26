import { AppModuleItemType } from '@/types/app';
import { AppSchema } from '@/types/mongoSchema';
import React, {
  useMemo,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
  ForwardedRef
} from 'react';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { streamFetch } from '@/api/fetch';
import MyTooltip from '@/components/MyTooltip';
import { useUserStore } from '@/store/user';
import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import { getGuideModule } from '@/components/ChatBox/utils';

export type ChatTestComponentRef = {
  resetChatTest: () => void;
};

const ChatTest = (
  {
    app,
    modules = [],
    onClose
  }: {
    app: AppSchema;
    modules?: AppModuleItemType[];
    onClose: () => void;
  },
  ref: ForwardedRef<ChatTestComponentRef>
) => {
  const ChatBoxRef = useRef<ComponentRef>(null);
  const { userInfo } = useUserStore();
  const isOpen = useMemo(() => modules && modules.length > 0, [modules]);

  const startChat = useCallback(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      const historyMaxLen =
        modules
          ?.find((item) => item.flowType === FlowModuleTypeEnum.historyNode)
          ?.inputs?.find((item) => item.key === 'maxContext')?.value || 0;
      const history = chatList.slice(-historyMaxLen - 2, -2);

      // 流请求，获取数据
      const { responseText, responseData } = await streamFetch({
        url: '/api/chat/chatTest',
        data: {
          history,
          prompt: chatList[chatList.length - 2].value,
          modules,
          variables,
          appId: app._id,
          appName: `调试-${app.name}`
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      return { responseText, responseData };
    },
    [app._id, app.name, modules]
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
        zIndex={3}
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
          <Box fontSize={'xl'} fontWeight={'bold'} flex={1}>
            调试预览
          </Box>
          <MyTooltip label={'重置'}>
            <IconButton
              className="chat"
              size={'sm'}
              icon={<MyIcon name={'clear'} w={'14px'} />}
              variant={'base'}
              borderRadius={'md'}
              aria-label={'delete'}
              onClick={(e) => {
                e.stopPropagation();
                ChatBoxRef.current?.resetHistory([]);
                ChatBoxRef.current?.resetVariables();
              }}
            />
          </MyTooltip>
        </Flex>
        <Box flex={1}>
          <ChatBox
            ref={ChatBoxRef}
            appAvatar={app.avatar}
            userAvatar={userInfo?.avatar}
            showMarkIcon
            userGuideModule={getGuideModule(modules)}
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

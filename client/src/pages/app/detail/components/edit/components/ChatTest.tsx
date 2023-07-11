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
import { Box, Flex, IconButton, useOutsideClick } from '@chakra-ui/react';
import MyIcon from '@/components/Icon';
import { FlowModuleTypeEnum } from '@/constants/flow';
import { SystemInputEnum } from '@/constants/app';
import { streamFetch } from '@/api/fetch';
import MyTooltip from '@/components/MyTooltip';
import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';

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
  const BoxRef = useRef(null);
  const ChatBoxRef = useRef<ComponentRef>(null);
  const isOpen = useMemo(() => modules && modules.length > 0, [modules]);

  const variableModules = useMemo(
    () =>
      modules
        .find((item) => item.flowType === FlowModuleTypeEnum.userGuide)
        ?.inputs.find((item) => item.key === SystemInputEnum.variables)?.value,
    [modules]
  );
  const welcomeText = useMemo(
    () =>
      modules
        .find((item) => item.flowType === FlowModuleTypeEnum.userGuide)
        ?.inputs?.find((item) => item.key === SystemInputEnum.welcomeText)?.value,
    [modules]
  );

  const startChat = useCallback(
    async ({ messages, controller, generatingMessage, variables }: StartChatFnProps) => {
      const historyMaxLen =
        modules
          ?.find((item) => item.flowType === FlowModuleTypeEnum.historyNode)
          ?.inputs?.find((item) => item.key === 'maxContext')?.value || 0;
      const history = messages.slice(-historyMaxLen - 2, -2);
      console.log(history, 'history====');

      // 流请求，获取数据
      const { responseText } = await streamFetch({
        url: '/api/chat/chatTest',
        data: {
          history,
          prompt: messages[messages.length - 2].content,
          modules,
          variables
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      return { responseText };
    },
    [modules]
  );

  useOutsideClick({
    ref: BoxRef,
    handler: () => {
      onClose();
    }
  });

  useImperativeHandle(ref, () => ({
    resetChatTest() {
      console.log(ChatBoxRef.current, '===');

      ChatBoxRef.current?.resetHistory([]);
      ChatBoxRef.current?.resetVariables();
    }
  }));

  return (
    <>
      <Box
        zIndex={2}
        display={isOpen ? 'block' : 'none'}
        position={'fixed'}
        top={0}
        left={0}
        bottom={0}
        right={0}
      />
      <Flex
        ref={BoxRef}
        zIndex={3}
        flexDirection={'column'}
        position={'absolute'}
        top={5}
        right={0}
        h={isOpen ? '95%' : '0'}
        w={isOpen ? '460px' : '0'}
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
              icon={<MyIcon name={'clearLight'} w={'14px'} />}
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
            variableModules={variableModules}
            welcomeText={welcomeText}
            onStartChat={startChat}
          />
        </Box>
      </Flex>
    </>
  );
};

export default React.memo(forwardRef(ChatTest));

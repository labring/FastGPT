import type { ModuleItemType } from '@fastgpt/global/core/module/type.d';
import { AppSchema } from '@fastgpt/global/core/app/type.d';
import React, {
  useMemo,
  useCallback,
  useRef,
  forwardRef,
  useImperativeHandle,
  ForwardedRef
} from 'react';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { streamFetch } from '@/web/common/api/fetch';
import MyTooltip from '@/components/MyTooltip';
import { useUserStore } from '@/web/support/user/useUserStore';
import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { checkChatSupportSelectFileByModules } from '@/web/core/chat/utils';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';

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
    modules?: ModuleItemType[];
    onClose: () => void;
  },
  ref: ForwardedRef<ChatTestComponentRef>
) => {
  const ChatBoxRef = useRef<ComponentRef>(null);
  const { userInfo } = useUserStore();
  const isOpen = useMemo(() => modules && modules.length > 0, [modules]);

  const startChat = useCallback(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      let historyMaxLen = 6;
      modules.forEach((module) => {
        module.inputs.forEach((input) => {
          if (
            (input.key === ModuleInputKeyEnum.history ||
              input.key === ModuleInputKeyEnum.historyMaxAmount) &&
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
        </Flex>
        <Box flex={1}>
          <ChatBox
            ref={ChatBoxRef}
            appAvatar={app.avatar}
            userAvatar={userInfo?.avatar}
            showMarkIcon
            userGuideModule={getGuideModule(modules)}
            showFileSelector={checkChatSupportSelectFileByModules(modules)}
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

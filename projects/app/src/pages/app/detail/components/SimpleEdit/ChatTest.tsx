import { useAppStore } from '@/web/core/app/store/useAppStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import ChatBox, { type ComponentRef, type StartChatFnProps } from '@/components/ChatBox';
import { ModuleItemType } from '@fastgpt/global/core/module/type';
import { ModuleInputKeyEnum } from '@fastgpt/global/core/module/constants';
import { streamFetch } from '@/web/common/api/fetch';
import MyTooltip from '@/components/MyTooltip';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { getGuideModule } from '@fastgpt/global/core/module/utils';
import { checkChatSupportSelectFileByModules } from '@/web/core/chat/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';

const ChatTest = ({ appId }: { appId: string }) => {
  const { t } = useTranslation();
  const { userInfo } = useUserStore();
  const { appDetail } = useAppStore();
  const ChatBoxRef = useRef<ComponentRef>(null);
  const [modules, setModules] = useState<ModuleItemType[]>([]);

  const startChat = useCallback(
    async ({ chatList, controller, generatingMessage, variables }: StartChatFnProps) => {
      let historyMaxLen = 0;

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
          appId,
          appName: `调试-${appDetail.name}`
        },
        onMessage: generatingMessage,
        abortSignal: controller
      });

      return { responseText, responseData };
    },
    [modules, appId, appDetail.name]
  );

  const resetChatBox = useCallback(() => {
    ChatBoxRef.current?.resetHistory([]);
    ChatBoxRef.current?.resetVariables();
  }, []);

  useEffect(() => {
    resetChatBox();
    setModules(appDetail.modules);
  }, [appDetail, resetChatBox]);

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
          appAvatar={appDetail.avatar}
          userAvatar={userInfo?.avatar}
          showMarkIcon
          userGuideModule={getGuideModule(modules)}
          showFileSelector={checkChatSupportSelectFileByModules(modules)}
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
          bg={'rgba(255,255,255,0.6)'}
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

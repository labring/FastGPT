import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import React from 'react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pages/app/detail/components/context';
import { useChatTest } from '@/pages/app/detail/components/useChatTest';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import LightRowTabs from '@fastgpt/web/components/common/Tabs/LightRowTabs';
import { PluginRunBoxTabEnum } from '@/components/core/chat/ChatContainer/PluginRunBox/constants';
import CloseIcon from '@fastgpt/web/components/common/Icon/close';

const ChatTest = ({
  isOpen,
  nodes = [],
  edges = [],
  onClose
}: {
  isOpen: boolean;
  nodes?: StoreNodeItemType[];
  edges?: StoreEdgeItemType[];
  onClose: () => void;
}) => {
  const { t } = useTranslation();
  const { appDetail } = useContextSelector(AppContext, (v) => v);
  const isPlugin = appDetail.type === AppTypeEnum.plugin;

  const { restartChat, ChatContainer, pluginRunTab, setPluginRunTab, chatRecords } = useChatTest({
    nodes,
    edges,
    chatConfig: appDetail.chatConfig
  });

  return (
    <>
      <Box
        zIndex={300}
        display={isOpen ? 'block' : 'none'}
        position={'fixed'}
        top={0}
        left={0}
        bottom={0}
        right={0}
        onClick={onClose}
      />
      <Flex
        zIndex={300}
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
        {isPlugin ? (
          <Flex
            alignItems={'flex-start'}
            justifyContent={'space-between'}
            px={3}
            pt={3}
            bg={'myGray.25'}
            borderBottom={'base'}
          >
            <LightRowTabs<PluginRunBoxTabEnum>
              list={[
                { label: t('common:common.Input'), value: PluginRunBoxTabEnum.input },
                ...(chatRecords.length > 0
                  ? [
                      { label: t('common:common.Output'), value: PluginRunBoxTabEnum.output },
                      { label: t('common:common.all_result'), value: PluginRunBoxTabEnum.detail }
                    ]
                  : [])
              ]}
              value={pluginRunTab}
              onChange={setPluginRunTab}
              inlineStyles={{ px: 0.5, pb: 2 }}
              gap={5}
              py={0}
              fontSize={'sm'}
            />

            <CloseIcon mt={1} onClick={onClose} />
          </Flex>
        ) : (
          <Flex
            py={2.5}
            px={5}
            whiteSpace={'nowrap'}
            bg={'myGray.25'}
            borderBottom={'1px solid #F4F4F7'}
          >
            <Flex fontSize={'16px'} fontWeight={'bold'} flex={1} alignItems={'center'}>
              <MyIcon name={'common/paused'} w={'14px'} mr={2.5} />
              {t('common:core.chat.Run test')}
            </Flex>
            <MyTooltip label={t('common:core.chat.Restart')}>
              <IconButton
                className="chat"
                size={'smSquare'}
                icon={<MyIcon name={'common/clearLight'} w={'14px'} />}
                variant={'whiteDanger'}
                borderRadius={'md'}
                aria-label={'delete'}
                onClick={restartChat}
              />
            </MyTooltip>
            <MyTooltip label={t('common:common.Close')}>
              <IconButton
                ml={4}
                icon={<SmallCloseIcon fontSize={'22px'} />}
                variant={'grayBase'}
                size={'smSquare'}
                aria-label={''}
                onClick={onClose}
                bg={'none'}
              />
            </MyTooltip>
          </Flex>
        )}

        <Box flex={'1 0 0'} overflow={'auto'}>
          <ChatContainer />
        </Box>
      </Flex>
    </>
  );
};

export default React.memo(ChatTest);

import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/index.d';
import React, { forwardRef, ForwardedRef } from 'react';
import { SmallCloseIcon } from '@chakra-ui/icons';
import { Box, Flex, IconButton } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import { StoreEdgeItemType } from '@fastgpt/global/core/workflow/type/edge';

import { useContextSelector } from 'use-context-selector';
import { AppContext } from '@/pages/app/detail/components/context';
import { useChatTest } from '@/pages/app/detail/components/useChatTest';

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
  const { appDetail } = useContextSelector(AppContext, (v) => v);

  const { resetChatBox, ChatBox } = useChatTest({
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
                resetChatBox();
              }}
            />
          </MyTooltip>
          <MyTooltip label={t('common.Close')}>
            <IconButton
              ml={3}
              icon={<SmallCloseIcon fontSize={'22px'} />}
              variant={'grayBase'}
              size={'smSquare'}
              aria-label={''}
              onClick={onClose}
            />
          </MyTooltip>
        </Flex>
        <Box flex={1}>
          <ChatBox />
        </Box>
      </Flex>
    </>
  );
};

export default React.memo(forwardRef(ChatTest));

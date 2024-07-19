import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useI18n } from '@/web/context/I18n';
import { useRequest2 } from '@fastgpt/web/hooks/useRequest';
import { queryChatInputGuideList } from '@/web/core/chat/inputGuide/api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';

export default function InputGuideBox({
  appId,
  text,
  onSelect,
  onSend
}: {
  appId: string;
  text: string;
  onSelect: (text: string) => void;
  onSend: (text: string) => void;
}) {
  const { t } = useTranslation();
  const { chatT } = useI18n();
  const chatInputGuide = useContextSelector(ChatBoxContext, (v) => v.chatInputGuide);
  const outLinkAuthData = useContextSelector(ChatBoxContext, (v) => v.outLinkAuthData);

  const { data = [] } = useRequest2(
    async () => {
      if (!text) return [];
      // More than 20 characters, it's basically meaningless
      if (text.length > 20) return [];
      return await queryChatInputGuideList(
        {
          appId,
          searchKey: text,
          ...outLinkAuthData
        },
        chatInputGuide.customUrl ? chatInputGuide.customUrl : undefined
      );
    },
    {
      manual: false,
      refreshDeps: [text],
      throttleWait: 300
    }
  );

  const filterData = data.filter((item) => item !== text).slice(0, 5);

  return filterData.length ? (
    <Box
      bg={'white'}
      boxShadow={'lg'}
      borderWidth={'1px'}
      borderColor={'borderColor.base'}
      p={2}
      borderRadius={'md'}
      position={'absolute'}
      top={-3}
      w={'100%'}
      zIndex={150}
      transform={'translateY(-100%)'}
    >
      <Flex alignItems={'center'} fontSize={'sm'} color={'myGray.600'} gap={2} mb={2} px={2}>
        <MyIcon name={'union'} />
        <Box>{chatT('input_guide')}</Box>
      </Flex>
      {data.map((item, index) => (
        <Flex
          alignItems={'center'}
          as={'li'}
          key={item}
          px={4}
          py={3}
          borderRadius={'sm'}
          cursor={'pointer'}
          overflow={'auto'}
          _notLast={{
            mb: 1
          }}
          bg={'myGray.50'}
          color={'myGray.600'}
          _hover={{
            bg: 'primary.50',
            color: 'primary.600',
            '.send-icon': {
              display: 'block'
            }
          }}
          onClick={() => onSelect(item)}
        >
          <Box fontSize={'sm'} flex={'1 0 0'}>
            <HighlightText rawText={item} matchText={text} />
          </Box>
          <MyTooltip label={t('common:core.chat.markdown.Send Question')}>
            <MyIcon
              className="send-icon"
              display={'none'}
              name={'chatSend'}
              boxSize={4}
              color={'myGray.500'}
              _hover={{
                color: 'primary.600'
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSend(item);
              }}
            />
          </MyTooltip>
        </Flex>
      ))}
    </Box>
  ) : null;
}

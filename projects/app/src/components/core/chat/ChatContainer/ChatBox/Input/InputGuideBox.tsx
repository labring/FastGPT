import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { queryChatInputGuideList } from '@/web/core/chat/inputGuide/api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';

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
  const chatInputGuide = useContextSelector(ChatBoxContext, (v) => v.chatInputGuide);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  const { data = [] } = useRequest(
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
      borderRadius={'6px'}
      border={'1px solid'}
      borderColor={'myGray.200'}
      boxShadow={'0px 4px 10px 0px rgba(19, 51, 107, 0.1), 0px 0px 1px 0px rgba(19, 51, 107, 0.1)'}
      position={'absolute'}
      top={-3}
      w={'100%'}
      p={'6px'}
      zIndex={150}
      transform={'translateY(-100%)'}
      overflow={'hidden'}
    >
      {data.map((item) => (
        <Flex
          alignItems={'center'}
          as={'li'}
          key={item}
          px={'8px'}
          py={'6px'}
          h={'32px'}
          borderRadius={'4px'}
          cursor={'pointer'}
          overflow={'hidden'}
          color={'myWhite.1000'}
          _hover={{
            bg: 'rgba(50, 136, 250, 0.06)',
            '.send-icon': {
              display: 'block'
            }
          }}
          onClick={() => onSelect(item)}
        >
          <Box fontSize={'12px'} lineHeight={'20px'} flex={'1 0 0'}>
            <HighlightText rawText={item} matchText={text} color={'blue.600'} />
          </Box>
          {/* <MyTooltip label={t('common:core.chat.markdown.Send Question')}>
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
          </MyTooltip> */}
        </Flex>
      ))}
    </Box>
  ) : null;
}

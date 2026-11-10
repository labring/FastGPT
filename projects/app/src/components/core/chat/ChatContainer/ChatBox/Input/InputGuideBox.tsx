import { Box, Flex } from '@chakra-ui/react';
import React, { useEffect, useMemo } from 'react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { queryChatInputGuideList } from '@/web/core/chat/inputGuide/api';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useTranslation } from 'next-i18next';
import HighlightText from '@fastgpt/web/components/common/String/HighlightText';
import { ChatBoxContext } from '../Provider';
import { useContextSelector } from 'use-context-selector';
import { WorkflowRuntimeContext } from '../../context/workflowRuntimeContext';
import type { ChatSourceTarget } from '@/web/core/chat/utils';
import { getCompletionSearchKeys } from '../utils/inputGuide';

export default function InputGuideBox({
  id,
  sourceTarget,
  text,
  activeIndex,
  onOptionsChange,
  onSelect,
  onSend
}: {
  id: string;
  sourceTarget: ChatSourceTarget;
  text: string;
  activeIndex: number;
  onOptionsChange: (options: string[], matchText: string) => void;
  onSelect: (text: string, matchText: string) => void;
  onSend: (text: string) => void;
}) {
  const { t } = useTranslation();
  const chatInputGuide = useContextSelector(ChatBoxContext, (v) => v.chatInputGuide);
  const outLinkAuthData = useContextSelector(WorkflowRuntimeContext, (v) => v.outLinkAuthData);

  const { data } = useRequest(
    async () => {
      for (const searchKey of getCompletionSearchKeys(text)) {
        // More than 20 characters, it's basically meaningless
        if (searchKey.length > 20) continue;
        const result = await queryChatInputGuideList(
          {
            sourceType: sourceTarget.sourceType,
            sourceId: sourceTarget.sourceId,
            searchKey,
            outLinkAuthData
          },
          chatInputGuide.customUrl ? chatInputGuide.customUrl : undefined
        );
        if (result.length) return { data: result, searchKey };
      }

      return { data: [], searchKey: '' };
    },
    {
      manual: false,
      refreshDeps: [text],
      throttleWait: 300
    }
  );

  const matchText = data?.searchKey ?? '';
  const filterData = useMemo(
    () => [...new Set(data?.data ?? [])].filter((item) => item !== text).slice(0, 5),
    [data, text]
  );

  useEffect(() => {
    onOptionsChange(filterData, matchText);
  }, [filterData, matchText, onOptionsChange]);

  return filterData.length ? (
    <Box
      id={id}
      role={'listbox'}
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
        <Box>{t('chat:input_guide')}</Box>
      </Flex>
      {filterData.map((item, index) => (
        <Flex
          alignItems={'center'}
          as={'li'}
          key={item}
          id={`${id}-${index}`}
          role={'option'}
          px={4}
          py={3}
          borderRadius={'sm'}
          cursor={'pointer'}
          overflow={'auto'}
          _notLast={{
            mb: 1
          }}
          bg={index === activeIndex ? 'primary.50' : 'myGray.50'}
          color={'myGray.600'}
          aria-selected={index === activeIndex}
          _hover={{
            bg: 'primary.50',
            color: 'primary.600',
            '.send-icon': {
              display: 'block'
            }
          }}
          onClick={() => onSelect(item, matchText)}
        >
          <Box fontSize={'sm'} flex={'1 0 0'}>
            <HighlightText rawText={item} matchText={matchText} />
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

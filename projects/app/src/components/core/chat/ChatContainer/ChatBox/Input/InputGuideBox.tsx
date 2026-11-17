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
import {
  getFirstCompletionResult,
  getCompletionSearchKeys,
  isCompletionResultCurrent
} from '../utils/inputGuide';

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
      return getFirstCompletionResult({
        queries: getCompletionSearchKeys(text),
        text,
        request: (searchKey) =>
          queryChatInputGuideList(
            {
              sourceType: sourceTarget.sourceType,
              sourceId: sourceTarget.sourceId,
              searchKey,
              outLinkAuthData
            },
            chatInputGuide.customUrl ? chatInputGuide.customUrl : undefined
          )
      });
    },
    {
      manual: false,
      refreshDeps: [text],
      throttleWait: 300
    }
  );

  const filterData = useMemo(
    () =>
      data?.searchKey && isCompletionResultCurrent({ text, searchKey: data.searchKey })
        ? data.data
        : [],
    [data, text]
  );
  const matchText = data?.searchKey && filterData.length ? data.searchKey : '';

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
      bottom={'calc(100% + 8px)'}
      left={0}
      right={0}
      zIndex={150}
    >
      <Flex alignItems={'center'} pb={1} fontSize={'sm'} color={'myGray.500'}>
        <Box>{t('chat:input_guide_hint')}</Box>
      </Flex>
      {filterData.map((item, index) => (
        <Flex
          alignItems={'center'}
          as={'li'}
          key={item}
          id={`${id}-${index}`}
          role={'option'}
          p={2}
          borderRadius={'sm'}
          cursor={'pointer'}
          overflow={'auto'}
          _notLast={{
            mb: 1
          }}
          bg={index === activeIndex ? 'primary.50' : 'myGray.50'}
          color={index === activeIndex ? 'primary.600' : 'myGray.600'}
          aria-selected={index === activeIndex}
          _hover={{
            bg: 'primary.50',
            color: 'primary.600'
          }}
          onClick={() => onSelect(item, matchText)}
        >
          <Box fontSize={'sm'} flex={'1 0 0'}>
            <HighlightText rawText={item} matchText={matchText} />
          </Box>
          <MyTooltip label={t('common:core.chat.markdown.Send Question')}>
            <MyIcon
              display={index === activeIndex ? 'block' : 'none'}
              name={'chatSend'}
              boxSize={4}
              color={'primary.600'}
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

import { Box, Card } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { MessageCardStyle } from '../../constants';
import { formatChatValue2InputType } from '../../utils/chatValue';
import HumanChatBubbleActions from './Actions';
import HumanChatBubbleContent from './Content';

type HumanChatBubbleProps = {
  chatValue: UserChatItemValueItemType[];
  chatTime?: Date;
  children?: React.ReactNode;
};

/**
 * 渲染用户消息气泡。
 *
 * 用户气泡的宽度、附件单列展示和 hover 操作区与 AI 气泡完全隔离，避免影响流式
 * AI 回复的原有宽度计算。编辑按钮当前只提供 UI 入口，后续需要接入消息编辑接口。
 */
const HumanChatBubble = ({ chatValue, chatTime, children }: HumanChatBubbleProps) => {
  const chatText = useMemo(() => formatChatValue2InputType(chatValue).text || '', [chatValue]);

  return (
    <Box
      display={'inline-block'}
      position={'relative'}
      w={'fit-content'}
      maxW={['calc(100% - 25px)', '700px']}
      _hover={{
        '& .chat-controller-hover': {
          display: 'flex'
        }
      }}
    >
      <Card
        {...MessageCardStyle}
        bg={'primary.50'}
        color={'myGray.900'}
        px={4}
        pt={3}
        pb={MessageCardStyle.py}
        borderRadius={'12px'}
        textAlign={'left'}
        maxW={'100%'}
      >
        <HumanChatBubbleContent chatValue={chatValue} />
        {children}
      </Card>
      <HumanChatBubbleActions chatText={chatText} chatTime={chatTime} />
    </Box>
  );
};

export default React.memo(HumanChatBubble);

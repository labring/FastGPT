import { Box, Card } from '@chakra-ui/react';
import React, { useMemo, useState } from 'react';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { useSystem } from '@fastgpt/web/hooks/useSystem';
import { MessageCardStyle } from '../../constants';
import { formatChatValue2InputType } from '../../utils/chatValue';
import HumanChatBubbleActions from './Actions';
import HumanChatBubbleContent from './Content';
import HumanChatBubbleEditDrawer from './EditDrawer';
import HumanChatBubbleEditForm from './EditForm';
import type { ChatBoxInputType } from '../../type';

type HumanChatBubbleProps = {
  chatValue: UserChatItemValueItemType[];
  chatTime?: Date;
  onEditSubmit?: (input: ChatBoxInputType) => void | Promise<void>;
  children?: React.ReactNode;
};

/**
 * 渲染用户消息气泡。
 *
 * 用户气泡的宽度、附件单列展示和 hover 操作区与 AI 气泡完全隔离，避免影响流式
 * AI 回复的原有宽度计算。编辑按钮当前只提供 UI 入口，后续需要接入消息编辑接口。
 */
const HumanChatBubble = ({ chatValue, chatTime, onEditSubmit, children }: HumanChatBubbleProps) => {
  const { isPc } = useSystem();
  const { text: chatText = '', files = [] } = useMemo(
    () => formatChatValue2InputType(chatValue),
    [chatValue]
  );
  const [isEditing, setIsEditing] = useState(false);

  if (isPc && isEditing) {
    return (
      <Box w={'100%'} maxW={'100%'} textAlign={'left'}>
        <HumanChatBubbleEditForm
          defaultValue={chatText}
          defaultFiles={files}
          onCancel={() => setIsEditing(false)}
          onSubmit={(input) => {
            onEditSubmit?.(input);
            setIsEditing(false);
          }}
        />
      </Box>
    );
  }

  return (
    <Box
      display={'inline-block'}
      position={'relative'}
      w={'fit-content'}
      maxW={'100%'}
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
      <HumanChatBubbleActions
        chatText={chatText}
        chatTime={chatTime}
        isAlwaysVisible={!isPc}
        onEdit={() => setIsEditing(true)}
      />
      {!isPc && isEditing && (
        <HumanChatBubbleEditDrawer
          isOpen={isEditing}
          defaultValue={chatText}
          defaultFiles={files}
          onClose={() => setIsEditing(false)}
          onSubmit={onEditSubmit}
        />
      )}
    </Box>
  );
};

export default React.memo(HumanChatBubble);

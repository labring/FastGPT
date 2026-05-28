import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import type { OnOpenCiteModalProps } from '@/web/core/chat/context/chatItemContext';
import AIResponseBox from '../../../../components/AIResponseBox';

type AIChatBubbleContentProps = {
  dataId: string;
  chatValue: AIChatItemValueItemType[];
  responseData?: ChatHistoryItemResType[];
  isLastChild: boolean;
  isChatting: boolean;
  onOpenCiteModal: (e?: OnOpenCiteModalProps) => void;
};

const AIChatBubbleContent = ({
  chatValue,
  responseData,
  dataId,
  isLastChild,
  isChatting,
  onOpenCiteModal
}: AIChatBubbleContentProps) => {
  return (
    <Flex flexDirection={'column'} fontSize={'16px'} lineHeight={1.75}>
      {chatValue.map((value, i) => {
        const isLastResponse = isLastChild && i === chatValue.length - 1;
        const key = `${dataId}-ai-${i}`;

        return (
          <Box key={key} _notFirst={{ mt: 2 }}>
            <AIResponseBox
              chatItemDataId={dataId}
              value={value}
              responseData={responseData}
              isLastResponseValue={isLastResponse}
              isLastChild={isLastChild}
              isChatting={isChatting}
              onOpenCiteModal={onOpenCiteModal}
            />
          </Box>
        );
      })}
    </Flex>
  );
};

export default React.memo(AIChatBubbleContent);

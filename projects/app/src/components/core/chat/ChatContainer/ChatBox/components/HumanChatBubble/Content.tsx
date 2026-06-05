import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import { isEqual } from 'lodash';
import type { UserChatItemValueItemType } from '@fastgpt/global/core/chat/type';
import { formatChatValue2InputType } from '../../utils/chatValue';
import FilesBlock from '../FilesBox';

type HumanChatBubbleContentProps = {
  chatValue: UserChatItemValueItemType[];
};

const HumanChatBubbleContent = ({ chatValue }: HumanChatBubbleContentProps) => {
  const { text, files = [] } = formatChatValue2InputType(chatValue);

  return (
    <Flex
      flexDirection={'column'}
      gap={2}
      alignItems={'flex-start'}
      w={'fit-content'}
      maxW={'100%'}
    >
      {text && (
        <Box
          fontSize={'inherit'}
          color={'inherit'}
          whiteSpace={'pre-wrap'}
          wordBreak={'break-word'}
          maxW={'100%'}
        >
          {text}
        </Box>
      )}
      {files.length > 0 && <FilesBlock files={files} singleColumn imageVariant={'chatBubble'} />}
    </Flex>
  );
};

export default React.memo(HumanChatBubbleContent, (prevProps, nextProps) =>
  isEqual(prevProps.chatValue, nextProps.chatValue)
);

import { Box } from '@chakra-ui/react';
import React from 'react';

type QuickRepliesProps = {
  options: string[];
  onClick?: (text: string) => void;
};

/** 将 quick-replies 选项渲染为纵向可点击按钮。 */
const QuickReplies = ({ options, onClick }: QuickRepliesProps) => {
  return (
    <Box
      display="flex"
      flexDirection="column"
      gap={2}
      mt={2}
      w="full"
      maxW="md"
      data-quick-replies=""
    >
      {options.map((text, index) => (
        <Box
          key={`${index}-${text}`}
          as="button"
          type="button"
          w="full"
          py={4}
          px={4}
          textAlign="left"
          bg="white"
          border="1px solid"
          borderColor="myGray.200"
          borderRadius="md"
          fontSize="sm"
          color="myGray.900"
          cursor="pointer"
          _hover={{ bg: 'primary.50', borderColor: 'primary.200' }}
          onClick={() => onClick?.(text)}
        >
          {text}
        </Box>
      ))}
    </Box>
  );
};

export default React.memo(QuickReplies);

import React from 'react';
import { Box, StackProps, HStack } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';

const IOTitle = ({
  text,
  inputExplanationUrl,
  ...props
}: { text?: 'Input' | 'Output' | string; inputExplanationUrl?: string } & StackProps) => {
  return (
    <HStack fontSize={'md'} alignItems={'center'} fontWeight={'medium'} mb={3} {...props}>
      <Box w={'3px'} h={'14px'} borderRadius={'13px'} bg={'primary.600'} />
      <Box color={'myGray.900'}>{text}</Box>
      <Box flex={1} />

      {inputExplanationUrl && (
        <MyIcon
          cursor={'pointer'}
          name="book"
          color={'primary.600'}
          w={'18px'}
          ml={1}
          _hover={{
            color: 'primary.800'
          }}
          onClick={() => window.open(inputExplanationUrl, '_blank')}
        />
      )}
    </HStack>
  );
};

export default React.memo(IOTitle);

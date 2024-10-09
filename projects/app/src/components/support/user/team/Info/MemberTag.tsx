import { Box, HStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import React from 'react';

type Props = {
  name: string;
  avatar: string;
};

function MemberTag({ name, avatar }: Props) {
  return (
    <HStack>
      <Avatar src={avatar} w={['18px', '22px']} rounded="50%" />
      <Box maxW={'150px'} className={'textEllipsis'}>
        {name}
      </Box>
    </HStack>
  );
}

export default MemberTag;

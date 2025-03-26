import { Box, HStack } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import React from 'react';

type Props = {
  name?: string;
  avatar?: string;
};

function MemberTag({ name, avatar }: Props) {
  return (
    <HStack>
      {avatar && <Avatar src={avatar} w={['18px', '22px']} rounded="50%" />}
      <Box maxW={'45vw'} className={'textEllipsis'} fontSize={'sm'}>
        {name || '-'}
      </Box>
    </HStack>
  );
}

export default MemberTag;

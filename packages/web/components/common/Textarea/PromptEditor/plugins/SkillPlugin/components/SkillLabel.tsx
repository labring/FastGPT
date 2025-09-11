import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import Avatar from '../../../../../Avatar';

interface SkillLabelProps {
  skillKey: string;
  skillName?: string;
  skillAvatar?: string;
}

export default function SkillLabel({ skillKey, skillName, skillAvatar }: SkillLabelProps) {
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      px={2}
      mx={1}
      bg="yellow.50"
      color="myGray.900"
      borderRadius="4px"
      fontSize="sm"
      cursor="pointer"
      _hover={{
        bg: 'yellow.100',
        borderColor: 'yellow.300'
      }}
    >
      <Flex alignItems="center" gap={1}>
        <Avatar
          src={skillAvatar || 'core/workflow/template/toolCall'}
          w={'14px'}
          h={'14px'}
          borderRadius={'2px'}
        />
        <Box>{skillName || skillKey}</Box>
      </Flex>
    </Box>
  );
}

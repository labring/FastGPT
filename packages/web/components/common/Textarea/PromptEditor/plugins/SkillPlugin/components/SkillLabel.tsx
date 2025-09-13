import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import Avatar from '../../../../../Avatar';

interface SkillLabelProps {
  skillKey: string;
  skillName?: string;
  skillAvatar?: string;
  isUnconfigured?: boolean;
  onConfigureClick?: () => void;
}

export default function SkillLabel({
  skillKey,
  skillName,
  skillAvatar,
  isUnconfigured = false,
  onConfigureClick
}: SkillLabelProps) {
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
      position="relative"
      _hover={{
        bg: 'yellow.100',
        borderColor: 'yellow.300'
      }}
      onClick={isUnconfigured ? onConfigureClick : undefined}
    >
      <Flex alignItems="center" gap={1}>
        <Avatar
          src={skillAvatar || 'core/workflow/template/toolCall'}
          w={'14px'}
          h={'14px'}
          borderRadius={'2px'}
        />
        <Box>{skillName || skillKey}</Box>
        {isUnconfigured && <Box w="6px" h="6px" bg="primary.600" borderRadius="50%" ml={1} />}
      </Flex>
    </Box>
  );
}

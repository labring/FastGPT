import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import Avatar from '../../../../../Avatar';
import MyTooltip from '../../../../../MyTooltip';
import MyIcon from '../../../../../Icon';
import { useTranslation } from 'next-i18next';
interface SkillLabelProps {
  skillKey: string;
  skillName?: string;
  skillAvatar?: string;
  isUnconfigured?: boolean;
  isInvalid?: boolean;
  onConfigureClick?: () => void;
}

export default function SkillLabel({
  skillKey,
  skillName,
  skillAvatar,
  isUnconfigured = false,
  isInvalid = false,
  onConfigureClick
}: SkillLabelProps) {
  const { t } = useTranslation();
  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      px={2}
      mx={1}
      bg={isInvalid ? 'red.50' : 'yellow.50'}
      color={isInvalid ? 'red.600' : 'myGray.900'}
      borderRadius="4px"
      fontSize="sm"
      cursor="pointer"
      position="relative"
      border={isInvalid ? '1px solid' : 'none'}
      borderColor={isInvalid ? 'red.200' : 'transparent'}
      _hover={{
        bg: isInvalid ? 'red.100' : 'yellow.100',
        borderColor: isInvalid ? 'red.300' : 'yellow.300'
      }}
      onClick={isUnconfigured ? onConfigureClick : undefined}
      transform={'translateY(2px)'}
    >
      <MyTooltip
        shouldWrapChildren={false}
        label={
          isUnconfigured ? (
            <Flex py={2} gap={2} fontWeight={'normal'} fontSize={'14px'} color={'myGray.900'}>
              <MyIcon name="common/warningFill" w={'18px'} />
              {t('common:Skill_Label_Unconfigured')}
            </Flex>
          ) : undefined
        }
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
          {isInvalid && <Box w="6px" h="6px" bg="red.600" borderRadius="50%" ml={1} />}
        </Flex>
      </MyTooltip>
    </Box>
  );
}

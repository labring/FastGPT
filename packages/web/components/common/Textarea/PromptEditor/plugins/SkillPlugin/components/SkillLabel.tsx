import { Box, Flex } from '@chakra-ui/react';
import React from 'react';
import Avatar from '../../../../../Avatar';
import MyTooltip from '../../../../../MyTooltip';
import MyIcon from '../../../../../Icon';
import { useTranslation } from 'next-i18next';

type SkillLabelProps = {
  skillKey: string;
  skillName?: string;
  skillAvatar?: string;
  skillType?: 'tool' | 'app';
  isInvalid?: boolean;
  isUnconfigured?: boolean;
  onConfigureClick?: () => void;
};

export default function SkillLabel({
  skillKey,
  skillName,
  skillAvatar,
  skillType = 'tool',
  isInvalid = false,
  isUnconfigured = false,
  onConfigureClick
}: SkillLabelProps) {
  const { t } = useTranslation();

  const getColors = () => {
    if (isInvalid) {
      return {
        bg: 'red.50',
        color: 'red.600',
        borderColor: 'red.200',
        hoverBg: 'red.100',
        hoverBorderColor: 'red.300'
      };
    }

    if (skillType === 'app') {
      return {
        bg: 'green.50',
        color: 'green.700',
        borderColor: 'transparent',
        hoverBg: 'green.100',
        hoverBorderColor: 'green.300'
      };
    }

    return {
      bg: 'yellow.50',
      color: 'myGray.900',
      borderColor: 'transparent',
      hoverBg: 'yellow.100',
      hoverBorderColor: 'yellow.300'
    };
  };

  const colors = getColors();

  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      px={2}
      mx={1}
      bg={colors.bg}
      color={colors.color}
      borderRadius="4px"
      fontSize="sm"
      cursor="pointer"
      position="relative"
      border={isInvalid ? '1px solid' : 'none'}
      borderColor={colors.borderColor}
      _hover={{
        bg: colors.hoverBg,
        borderColor: colors.hoverBorderColor
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

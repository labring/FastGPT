import { Box, Flex } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import Avatar from '../../../../../Avatar';
import MyTooltip from '../../../../../MyTooltip';
import { useTranslation } from 'next-i18next';
import type { SkillLabelNodeBasicType } from '../node';
import { useMemoEnhance } from '../../../../../../../hooks/useMemoEnhance';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';

export default function SkillLabel({
  id,
  name,
  icon,
  skillType,
  status,
  onClick
}: SkillLabelNodeBasicType) {
  const { t } = useTranslation();

  const isInvalid = status === 'invalid';
  const isUnconfigured = status === 'waitingForConfig';
  const isConfigured = status === 'configured';

  const colors = useMemoEnhance(() => {
    if (status === 'invalid') {
      return {
        bg: 'red.50',
        color: 'red.600',
        borderColor: 'red.200',
        hoverBg: 'red.100',
        hoverBorderColor: 'red.300'
      };
    }

    if (skillType === FlowNodeTypeEnum.appModule) {
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
  }, [status, skillType]);

  const tipText = useMemo(() => {
    if (isInvalid) {
      return t('common:tool_invalid_click_delete_tip');
    }
    if (isUnconfigured) {
      return t('common:Skill_Label_Unconfigured');
    }
    if (isConfigured) {
      return t('common:Skill_Label_Click_To_Configure');
    }
  }, [isInvalid, isUnconfigured, isConfigured, t]);

  return (
    <Box
      as="span"
      display="inline-flex"
      alignItems="center"
      userSelect={'none'}
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
      onClick={() => onClick(id)}
      transform={'translateY(2px)'}
    >
      <MyTooltip shouldWrapChildren={false} label={tipText}>
        <Flex alignItems="center" gap={1}>
          {isInvalid ? (
            <>
              <Box>{t('common:tool_invalid')}</Box>
            </>
          ) : (
            <>
              <Avatar src={icon} w={'14px'} h={'14px'} borderRadius={'2px'} />
              <Box>{name || id}</Box>
              {isUnconfigured && <Box w="6px" h="6px" bg="primary.600" borderRadius="50%" ml={1} />}
            </>
          )}
        </Flex>
      </MyTooltip>
    </Box>
  );
}

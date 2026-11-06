import React from 'react';
import { Box, Flex, type FlexProps } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import type { UsageSourceMember } from '@fastgpt/global/support/wallet/usage/filter';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

/** 成员在筛选项、明细和详情中使用一致的当前资料与状态；物理缺失单独标记。 */
export const UsageMember = ({
  member,
  compact = false,
  isSelf = false,
  ...props
}: {
  member: UsageSourceMember;
  compact?: boolean;
  isSelf?: boolean;
} & FlexProps) => {
  const { t } = useSafeTranslation();
  const status = member.unavailable
    ? t('account_usage:member_unavailable')
    : member.status === TeamMemberStatusEnum.leave
      ? t('account_team:leave')
      : member.status === TeamMemberStatusEnum.forbidden
        ? t('account_team:forbidden')
        : '';
  return (
    <Flex alignItems={'center'} gap={compact ? 2 : 1} minW={0} {...props}>
      <Avatar
        src={member.avatar}
        w={compact ? '16px' : '20px'}
        flexShrink={0}
        borderRadius={'full'}
      />
      <MyTooltip label={member.name} showOnlyWhenOverflow shouldWrapChildren={false}>
        <Box className={'textEllipsis'} minW={0} flex={1} color={'myGray.600'}>
          {member.name}
        </Box>
      </MyTooltip>
      {status && (
        <Box
          flexShrink={0}
          bg={'myGray.100'}
          color={'myGray.700'}
          px={2}
          py={1}
          borderRadius={'sm'}
          fontSize={'10px'}
          lineHeight={'14px'}
          fontWeight={'medium'}
        >
          {status}
        </Box>
      )}
      {isSelf && (
        <Box flexShrink={0} color={'myGray.500'}>
          {t('common:filter_me')}
        </Box>
      )}
    </Flex>
  );
};

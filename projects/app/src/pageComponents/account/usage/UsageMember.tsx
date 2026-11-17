import React from 'react';
import { Box, type BoxProps, Flex, type FlexProps } from '@chakra-ui/react';
import Avatar from '@fastgpt/web/components/common/Avatar';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { TeamMemberStatusEnum } from '@fastgpt/global/support/user/team/constant';
import type { UsageSourceMember } from '@fastgpt/global/support/wallet/usage/filter';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

/** 解析成员异常状态文案（物理缺失、离职、停用），正常在职返回空字符串。 */
export const getUsageMemberStatusLabel = (
  member: Pick<UsageSourceMember, 'status' | 'unavailable'>,
  t: ReturnType<typeof useSafeTranslation>['t']
) => {
  if (member.unavailable) return t('account_usage:member_unavailable');
  if (member.status === TeamMemberStatusEnum.leave) return t('account_team:leave');
  if (member.status === TeamMemberStatusEnum.forbidden) return t('account_team:forbidden');
  return '';
};

export const UsageMemberStatusTag = ({ status, ...props }: { status: string } & BoxProps) => (
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
    {...props}
  >
    {status}
  </Box>
);

/** 成员在明细和详情中使用一致的当前资料与状态；物理缺失单独标记。 */
export const UsageMember = ({ member, ...props }: { member: UsageSourceMember } & FlexProps) => {
  const { t } = useSafeTranslation();
  const status = getUsageMemberStatusLabel(member, t);
  return (
    <Flex alignItems={'center'} gap={1} minW={0} {...props}>
      <Avatar src={member.avatar} w={'20px'} flexShrink={0} borderRadius={'full'} />
      <MyTooltip label={member.name} showOnlyWhenOverflow shouldWrapChildren={false}>
        <Box className={'textEllipsis'} minW={0} flex={1} color={'myGray.600'}>
          {member.name}
        </Box>
      </MyTooltip>
      {status && <UsageMemberStatusTag status={status} />}
    </Flex>
  );
};

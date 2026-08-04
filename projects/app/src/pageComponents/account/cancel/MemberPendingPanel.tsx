import { Box, Text, VStack } from '@chakra-ui/react';
import type { TeamAccountCancellationStatus } from '@fastgpt/global/support/user/account/cancellation/type';
import { useTranslation } from 'next-i18next';
import TeamSelector from '@/pageComponents/account/TeamSelector';

/** 当前团队仍处于 owner 注销生命周期时，向成员提供说明和团队切换入口。 */
export const MemberPendingPanel = ({
  teamName,
  status,
  scheduledCancelAt
}: {
  teamName: string;
  status: TeamAccountCancellationStatus;
  scheduledCancelAt?: Date | string;
}) => {
  const { t } = useTranslation();
  const isPending = status === 'pending';
  const scheduledTime =
    isPending && scheduledCancelAt ? new Date(scheduledCancelAt).toLocaleString() : undefined;

  return (
    <VStack w="100%" align="stretch" spacing={0}>
      <Text fontSize="20px" fontWeight="500" lineHeight="30px" textAlign="center">
        {t('account_info:account_cancellation_team_title', '团队注销中')}
      </Text>
      <Box pt={8} fontSize="sm" lineHeight="20px" color="black">
        <Text>
          <Text as="span" fontWeight="500">
            {teamName}{' '}
          </Text>
          {isPending
            ? t(
                'account_info:account_cancellation_team_pending_desc',
                '团队已由团队所有者提交注销申请，目前处于 15 天注销等待期。您可联系团队所有者取消注销。'
              )
            : t(
                'account_info:account_cancellation_team_finalizing_desc',
                '团队已进入注销清理阶段。您可联系团队所有者了解处理进度。'
              )}
        </Text>
        {scheduledTime && (
          <Text mt={2}>
            {t('account_info:account_cancellation_team_scheduled_at', '预计清理时间：{{time}}', {
              time: scheduledTime
            })}
          </Text>
        )}
      </Box>
      <Box pt={8}>
        <Text mb={2} fontSize="sm" fontWeight="500" lineHeight="20px" color="myGray.900">
          {t('account_info:account_cancellation_switch_team', '切换团队')}
        </Text>
        <TeamSelector h="40px" />
      </Box>
    </VStack>
  );
};

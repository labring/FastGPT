import { Button, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';

/** 展示本人注销等待期或 finalizing 状态，所有时间均直接使用 API 返回值。 */
export const CancelPendingPanel = ({
  requestedAt,
  scheduledCancelAt,
  canCancel,
  onCancel,
  loading
}: {
  requestedAt: string;
  scheduledCancelAt?: string;
  canCancel: boolean;
  onCancel: () => void;
  loading: boolean;
}) => {
  const { t } = useTranslation();
  const formatDate = (value: string) => new Date(value).toLocaleString();

  return (
    <VStack w="100%" align="stretch" spacing={0}>
      <Text fontSize="20px" fontWeight="500" lineHeight="30px" textAlign="center">
        {t('account_info:account_cancellation_in_progress_title', '注销中')}
      </Text>
      <VStack pt={8} align="stretch" spacing={0} fontSize="sm" lineHeight="20px" color="black">
        {canCancel ? (
          <>
            <Text>
              {t(
                'account_info:account_cancellation_pending_desc',
                '你的账号已提交注销申请，目前处于 15 天注销等待期。'
              )}
            </Text>
            <Text>
              {t('account_info:account_cancellation_requested_at', '申请时间：{{time}}', {
                time: formatDate(requestedAt)
              })}
            </Text>
            {scheduledCancelAt && (
              <Text>
                {t('account_info:account_cancellation_scheduled_at', '预计注销时间：{{time}}', {
                  time: formatDate(scheduledCancelAt)
                })}
              </Text>
            )}
            <Text>
              {t(
                'account_info:account_cancellation_pending_service_desc',
                '等待期内，该账号将无法正常使用，所有依赖该账号对外提供服务的渠道已停止生效。'
              )}
            </Text>
            <Text>
              {t(
                'account_info:account_cancellation_pending_cancel_desc',
                '若这不是你本人操作，或你希望继续使用该账号，请在预计注销时间前取消注销。取消后，账号将恢复正常状态。'
              )}
            </Text>
          </>
        ) : (
          <>
            <Text>
              {t(
                'account_info:account_cancellation_finalizing_desc',
                '你的账号已进入注销处理阶段，系统正在清理账号及相关数据。'
              )}
            </Text>
            <Text>
              {t('account_info:account_cancellation_requested_at', '申请时间：{{time}}', {
                time: formatDate(requestedAt)
              })}
            </Text>
            <Text>
              {t(
                'account_info:account_cancellation_finalizing_no_estimate',
                '该阶段无法取消注销，预计完成时间不再展示。'
              )}
            </Text>
          </>
        )}
      </VStack>
      {canCancel && (
        <Button mt={8} w="100%" h="40px" isLoading={loading} variant="whiteBase" onClick={onCancel}>
          {t('account_info:account_cancellation_cancel', '取消注销')}
        </Button>
      )}
    </VStack>
  );
};

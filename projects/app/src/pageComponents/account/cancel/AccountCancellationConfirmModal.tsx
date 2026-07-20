import { Box, Button, Text } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';

export const AccountCancellationConfirmModal = ({
  isOpen,
  onClose,
  onConfirm
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) => {
  const { t } = useTranslation();
  const footerButtonStyles = {
    h: 8,
    minH: 8,
    px: 3.5,
    py: 2,
    fontSize: 'mini',
    lineHeight: '16px',
    letterSpacing: 0.5
  };

  return (
    <MyModal
      isOpen={isOpen}
      onClose={onClose}
      title={t('account_info:account_cancellation_confirm_title', '注销提示')}
      size="md"
      isCentered
      maxH="80vh"
      bodyStyles={{
        minH: 0,
        overflow: 'hidden',
        px: 0,
        pt: 0,
        pb: 0
      }}
      footer={
        <>
          <Button {...footerButtonStyles} w={16} variant="whiteBase" onClick={onClose}>
            {t('common:cancel', '取消')}
          </Button>
          <Button {...footerButtonStyles} onClick={onConfirm}>
            {t('account_info:account_cancellation_continue', '已知晓，下一步')}
          </Button>
        </>
      }
    >
      <Box
        flex="1 1 auto"
        minH={0}
        overflowY="auto"
        overscrollBehavior="contain"
        px={8}
        pt={6}
        pb={6}
        color="myGray.900"
        fontSize="sm"
        lineHeight="20px"
        letterSpacing={0.25}
      >
        <Text>
          {t('account_info:account_cancellation_confirm_intro', '注销账号前，请确认以下事项：')}
        </Text>

        <br />

        <Text>
          {t(
            'account_info:account_cancellation_confirm_waiting_prefix',
            '提交注销申请后，账号将进入 15 天等待期。等待期内，该账号将无法正常使用，所有'
          )}
          <Text as="span" color="primary.600">
            {t(
              'account_info:account_cancellation_confirm_service_impact',
              '依赖该账号对外提供服务的渠道将停止生效'
            )}
          </Text>
          {t(
            'account_info:account_cancellation_confirm_waiting_suffix',
            '，包括但不限于 API Key、分享链接和对外调用接口。系统通知信息仍可正常接收。'
          )}
        </Text>

        <br />

        <Box>
          <Text>
            {t(
              'account_info:account_cancellation_confirm_completion_intro',
              '等待期结束后，账号注销将正式完成。届时：'
            )}
          </Text>
          <Box as="ul" pl={5}>
            <Box as="li">
              {t('account_info:account_cancellation_confirm_owned_team_prefix', '该账号下')}
              <Text as="span" color="primary.600">
                {t(
                  'account_info:account_cancellation_confirm_owned_team_impact',
                  '创建的团队将被删除'
                )}
              </Text>
            </Box>
            <Box as="li">
              {t(
                'account_info:account_cancellation_confirm_team_data_impact',
                '团队内的应用、数据、成员、配置等信息将被删除，团队成员无法进入团队'
              )}
            </Box>
            <Box as="li">
              {t(
                'account_info:account_cancellation_confirm_personal_data_impact',
                '该账号的个人信息将被删除或匿名化处理'
              )}
            </Box>
            <Box as="li">
              {t(
                'account_info:account_cancellation_confirm_leave_team_impact',
                '该账号加入的其他团队将自动退出'
              )}
            </Box>
          </Box>
        </Box>

        <br />

        <Box>
          <Text>
            {t(
              'account_info:account_cancellation_confirm_before_continue',
              '在继续前，请确认你已处理好以下事项：'
            )}
          </Text>
          <Box as="ul" pl={5}>
            <Box as="li">
              {t(
                'account_info:account_cancellation_confirm_team_transfer',
                '已完成团队归属转移或团队数据处理'
              )}
            </Box>
            <Box as="li">
              {t(
                'account_info:account_cancellation_confirm_order_refund',
                '已处理未完成订单、退款等事项'
              )}
            </Box>
            <Box as="li">
              {t(
                'account_info:account_cancellation_confirm_backup',
                '已备份重要数据、配置和业务资料'
              )}
            </Box>
            <Box as="li">
              {t(
                'account_info:account_cancellation_confirm_service_stop',
                '已确认相关服务停用不会影响线上业务'
              )}
            </Box>
          </Box>
        </Box>

        <br />

        <Box>
          <Text>
            {t(
              'account_info:account_cancellation_confirm_verification_effect',
              '完成身份验证后，注销申请将正式生效。'
            )}
          </Text>
          <Text>
            {t(
              'account_info:account_cancellation_confirm_cancel_during_wait',
              '在 15 天等待期内，你可以重新登录账号并取消注销。'
            )}
          </Text>
          <Text>
            {t(
              'account_info:account_cancellation_confirm_reregister',
              '账号注销完成后，如果你再次使用该账号注册，将会创建一个全新的账号，原账号数据无法恢复。'
            )}
          </Text>
        </Box>
      </Box>
    </MyModal>
  );
};

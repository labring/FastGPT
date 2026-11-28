import React from 'react';
import { Box, Button } from '@chakra-ui/react';
import MyTooltip from '@fastgpt/web/components/common/MyTooltip';
import { useCopyData } from '@fastgpt/web/hooks/useCopyData';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

/** 阿里云短信控制台申请模板时的中文参考文案，变量名与服务端 sendMessage 实际传参一致。 */
export const SMS_TEMPLATE_EXAMPLES = {
  login: '您的登录验证码为：${code}，该验证码5分钟内有效，请勿泄露于他人。',
  resetPassword: '您正在找回密码，验证码为：${code}，该验证码5分钟内有效，请勿泄露于他人。',
  changePassword: '您正在修改密码，验证码为：${code}，该验证码5分钟内有效，请勿泄露于他人。',
  bindNotification: '您正在绑定通知方式，验证码为：${code}，该验证码5分钟内有效，请勿泄露于他人。',
  modelDeprecation:
    '尊敬的${name}团队，以下模型将于${plannedDeprecationAt}下架：${models}，请提前更换相关应用和知识库所使用的模型，避免影响正常使用。',
  cancellationCode: '您正在申请注销账号，验证码为：${code}，该验证码5分钟内有效，请勿泄露于他人。',
  cancellationReminder:
    '您的账号${name}将在${scheduledDeleteAt}完成注销，剩余${days}天。如需继续使用，请及时登录并取消注销。',
  cancellationToday:
    '您的账号${name}将于今日完成注销，注销后账号及相关数据将无法恢复。如需继续使用，请立即登录并取消注销。',
  lackOfPoints: '尊敬的${name}团队，您的AI积分已耗尽，AI相关功能已停止运行，请及时登录平台充值。',
  pointsThirtyPercentRemain:
    '尊敬的${name}团队，您的AI积分已不足30%，为保障服务正常运行，请及时登录平台充值。',
  pointsTenPercentRemain:
    '尊敬的${name}团队，您的AI积分已不足10%，即将耗尽，为保障服务正常运行，请及时登录平台充值。',
  freeClean:
    '尊敬的${name}团队，由于近期无使用记录，系统将在${day}天后自动清理您的知识库，请及时登录平台查看。',
  expireSoon:
    '尊敬的${name}团队，您的${sub}还有${day}天到期，为保障服务正常运行，请及时登录平台续费。',
  expired: '尊敬的${name}团队，您的${sub}已到期，为保障服务正常运行，请及时登录平台续费。'
} as const;

export type SmsTemplateExampleKey = keyof typeof SMS_TEMPLATE_EXAMPLES;

/** 短信模板输入框右侧的「短信示例」轻量按钮：悬停查看阿里云模板示例，点击复制示例内容。 */
const SmsTemplateExampleButton = ({ templateKey }: { templateKey: SmsTemplateExampleKey }) => {
  const { t } = useSafeTranslation();
  const { copyData } = useCopyData();
  const template = SMS_TEMPLATE_EXAMPLES[templateKey];

  return (
    <MyTooltip
      shouldWrapChildren={false}
      maxW={'320px'}
      label={
        <Box>
          <Box color={'myGray.900'}>{template}</Box>
          <Box mt={1.5} fontSize={'xs'} color={'myGray.500'}>
            {t('admin:click_to_copy_sms_example')}
          </Box>
        </Box>
      }
    >
      <Button
        type={'button'}
        variant={'ghost'}
        size={'xs'}
        h={'auto'}
        minH={'20px'}
        px={1.5}
        py={0.5}
        fontSize={'xs'}
        fontWeight={'normal'}
        color={'primary.600'}
        _hover={{ bg: 'primary.50' }}
        onClick={() => void copyData(template)}
      >
        {t('admin:sms_template_example')}
      </Button>
    </MyTooltip>
  );
};

export default React.memo(SmsTemplateExampleButton);

import { Link, type LinkProps } from '@chakra-ui/react';
import { useTranslation } from 'next-i18next';
import { useSystemStore } from '@/web/common/system/useSystemStore';

/** 仅在配置了登录引导地址时渲染帮助入口，不为缺失配置保留占位。 */
const LoginGuideLink = ({ mt = 8 }: Pick<LinkProps, 'mt'>) => {
  const { t } = useTranslation();
  const { feConfigs } = useSystemStore();
  const loginGuideDocUrl = feConfigs?.loginGuideDocUrl?.trim();

  if (!loginGuideDocUrl) return null;

  return (
    <Link
      display="block"
      mt={mt}
      color="primary.700"
      fontSize="mini"
      fontWeight="medium"
      lineHeight="16px"
      textAlign="center"
      href={loginGuideDocUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      {t('common:support.user.login.can_not_login')}
    </Link>
  );
};

export default LoginGuideLink;

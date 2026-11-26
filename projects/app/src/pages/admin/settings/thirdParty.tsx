import type { GetServerSideProps } from 'next';

/** 旧第三方配置页已由外部提供商页面接管，保留路由重定向避免旧书签 404。 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/admin/settings/providers',
    permanent: false
  }
});

export default function LegacyThirdPartySettingsRedirect() {
  return null;
}

import type { GetServerSideProps } from 'next';

/** 旧账号配置页已由认证设置页接管，保留路由重定向避免旧书签 404。 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/admin/settings/auth',
    permanent: false
  }
});

export default function LegacyUserSettingsRedirect() {
  return null;
}

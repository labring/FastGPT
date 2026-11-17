import type { GetServerSideProps } from 'next';

/** 旧基础配置页已由实例配置页面接管，保留路由重定向避免旧书签 404。 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/admin/settings/core',
    permanent: false
  }
});

export default function LegacyBasicSettingsRedirect() {
  return null;
}

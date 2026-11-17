import type { GetServerSideProps } from 'next';

/** 旧模型配置页已由系统模型和安全管理页面接管，保留路由重定向避免旧书签 404。 */
export const getServerSideProps: GetServerSideProps = async () => ({
  redirect: {
    destination: '/admin/resources/model',
    permanent: false
  }
});

export default function LegacyModelSettingsRedirect() {
  return null;
}

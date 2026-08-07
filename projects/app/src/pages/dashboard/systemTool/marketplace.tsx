import { ToolkitMarketplace } from '@/pageComponents/config/tool/Marketplace';
import { serviceSideProps } from '@/web/common/i18n/utils';

export async function getServerSideProps(content: any) {
  const { appEnv } = await import('@/env');

  return {
    props: {
      ...(await serviceSideProps(content, ['app'])),
      marketplaceUrl: appEnv.MARKETPLACE_URL
    }
  };
}

export default function TeamToolkitMarketplace(props: { marketplaceUrl: string }) {
  return <ToolkitMarketplace {...props} mode="team" />;
}

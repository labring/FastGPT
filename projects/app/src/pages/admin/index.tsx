import { serviceSideProps } from '@/web/common/i18n/utils';
import React, { useEffect } from 'react';
import { useRouter } from 'next/router';
import Loading from '@fastgpt/web/components/common/MyLoading';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { useUserStore } from '@/web/support/user/useUserStore';
import { isLicenseActive } from '@fastgpt/global/common/system/license/utils';
import { getAdminDefaultRoute } from '@/pageComponents/admin/useAdminMenu';

/**
 * /admin 入口页：把访问者分发到与部署形态、授权状态匹配的默认页面。
 * - 社区版（无 PRO_URL）：许可证页，没有数据面板与商业能力
 * - 商业版且 License 生效：数据面板
 * - 商业版未激活 / 已过期：许可证页，作为激活与续期入口
 *
 * 非 root 用户（此时 Auth 已保证 userInfo 就绪）不等待 License 检测，
 * 按未激活分发到许可证页，再由落地页 AdminContainer 引导回个人中心。
 */
const AdminEntryPage = () => {
  const router = useRouter();
  const { feConfigs, licenseData, licenseLoading, initd } = useSystemStore();
  const { userInfo } = useUserStore();
  const isRoot = userInfo?.username === 'root';
  const isProService = !!feConfigs?.isProService;

  useEffect(() => {
    if (!router.isReady || !initd) return;
    // License 检测只由 root 触发（见 Layout），且商业版必须等检测结束再分发，
    // 否则已激活的部署会先落到许可证页再跳数据面板。
    if (isRoot && isProService && licenseLoading) return;

    void router.replace(
      getAdminDefaultRoute({
        isProService,
        isLicenseActive: isLicenseActive(licenseData)
      })
    );
  }, [initd, isProService, isRoot, licenseData, licenseLoading, router]);

  return <Loading />;
};

export async function getServerSideProps(content: any) {
  return {
    props: {
      ...(await serviceSideProps(content, ['admin']))
    }
  };
}

export default AdminEntryPage;

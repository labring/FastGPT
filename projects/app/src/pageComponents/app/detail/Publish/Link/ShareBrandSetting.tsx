import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useUnmountedRef } from 'ahooks';
import { Box, Flex, Switch } from '@chakra-ui/react';
import type { OutLinkSchemaType } from '@fastgpt/global/support/outLink/type';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useToast } from '@fastgpt/web/hooks/useToast';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import { useUserStore } from '@/web/support/user/useUserStore';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { putShareChat } from '@/web/support/outLink/api';
import { getTeamPlanEntitlements } from '@/web/support/user/team/api';
import { RechargeModal } from '@/components/support/wallet/NotSufficientModal';
import ProModal from '@/components/ProTip/ProModal';

type ShareBrandLink = Pick<OutLinkSchemaType, '_id' | 'teamId' | 'isShowBrand'>;

/** 展示链接的有效水印状态；无隐藏权益时仅引导升级，由用户取得权益后再次手动关闭。 */
const ShareBrandSetting = ({
  share,
  onBrandSaved
}: {
  share: ShareBrandLink;
  onBrandSaved: (id: string, isShowBrand: boolean) => Promise<void>;
}) => {
  const { t } = useSafeTranslation();
  const { toast } = useToast();
  const { feConfigs } = useSystemStore();
  const { userInfo } = useUserStore();
  const unmounted = useUnmountedRef();
  const [upgrade, setUpgrade] = useState(false);
  const isShowBrand = share.isShowBrand;
  const teamId = userInfo?.team.teamId;
  const tmbId = userInfo?.team.tmbId;
  const {
    data: canHideShareBrand,
    isFetching,
    refetch
  } = useQuery(
    ['shareBrandPlan', teamId, tmbId],
    async () => {
      const result = await getTeamPlanEntitlements();
      // 空响应不是无权益，避免兼容错误响应时误导用户购买。
      if (result === null || result === undefined) throw new Error('Team plan unavailable');
      if (result.scope !== 'entitlements' || typeof result.canHideShareBrand !== 'boolean')
        throw new Error('Team entitlements unavailable');
      return result.canHideShareBrand;
    },
    {
      enabled: !!feConfigs.show_outlink_brand && teamId === share.teamId,
      retry: false,
      refetchOnWindowFocus: false,
      onError: () => toast({ status: 'error', title: t('common:share_brand_plan_load_failed') })
    }
  );

  const closeUpgrade = () => setUpgrade(false);

  const { runAsync: toggle, loading: busy } = useRequest(
    async (isShowBrand: boolean) => {
      // 查询或保存期间切换成员后，旧操作不能打开购买弹窗或更新当前界面。
      const isCurrentMember = () => {
        const team = useUserStore.getState().userInfo?.team;
        return !unmounted.current && team?.teamId === share.teamId && team?.tmbId === tmbId;
      };
      if (!isCurrentMember()) return;
      if (!isShowBrand) {
        const refreshed = await refetch();
        if (!isCurrentMember() || refreshed.isError || refreshed.data === undefined) return;
        if (!refreshed.data) {
          setUpgrade(true);
          return;
        }
      }
      await putShareChat({ _id: share._id, isShowBrand });
      if (!isCurrentMember()) return;
      // 保存已经成功；列表同步失败不能被当作品牌更新失败。
      await onBrandSaved(share._id, isShowBrand).catch(() => {});
    },
    {
      errorToast: t('common:update_failed')
    }
  );

  if (!feConfigs.show_outlink_brand) return null;
  return (
    <>
      <Flex alignItems="center" gap={2} p={2} borderRadius="md" bg="myWhite.600" borderWidth="1px">
        <Box flex={1}>{t('common:share_brand')}</Box>
        <QuestionTip label={t('common:share_brand_tip')} />
        <Switch
          aria-label={t('common:share_brand')}
          isChecked={isShowBrand === true || (isShowBrand === false && canHideShareBrand === false)}
          isDisabled={
            canHideShareBrand === undefined || isFetching || busy || teamId !== share.teamId
          }
          onChange={(event) => void toggle(event.target.checked).catch(() => {})}
        />
      </Flex>
      {upgrade &&
        (feConfigs.isPlus ? (
          <RechargeModal onClose={closeUpgrade} onPaySuccess={closeUpgrade} highlightShareBrand />
        ) : (
          <ProModal isOpen onClose={closeUpgrade} />
        ))}
    </>
  );
};
export default React.memo(ShareBrandSetting);

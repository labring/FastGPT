import React, { useEffect, useRef } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import MyIcon from '@fastgpt/web/components/common/Icon';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import { useSystemStore } from '@/web/common/system/useSystemStore';
import { StandardSubLevelEnum } from '@fastgpt/global/support/wallet/sub/constants';

/** 所有前台套餐入口共用的权益行；定位只允许高级版自身授权的条目。 */
const ShareBrandFeature = ({
  level,
  highlight = false
}: {
  level: `${StandardSubLevelEnum}`;
  highlight?: boolean;
}) => {
  const { t } = useSafeTranslation();
  const { feConfigs, subPlans } = useSystemStore();
  const ref = useRef<HTMLDivElement>(null);
  const visible =
    !!feConfigs.show_outlink_brand && subPlans?.standard?.[level]?.canHideShareBrand === true;
  const focused = visible && highlight && level === StandardSubLevelEnum.advanced;
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focused]);

  return visible ? (
    <Flex ref={ref} data-plan-feature="share-brand" data-plan-level={level} alignItems="center">
      <MyIcon name="price/right" w="16px" mr={3} color="primary.600" />
      <Box
        color="myGray.600"
        bg={focused ? 'yellow.200' : undefined}
        fontWeight={focused ? 'bold' : undefined}
      >
        {t('common:share_brand_control')}
      </Box>
      {focused && <QuestionTip ml={1} label={t('common:share_brand_tip')} />}
    </Flex>
  ) : null;
};
export default React.memo(ShareBrandFeature);

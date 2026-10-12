import { Box, Button, Flex, Grid } from '@chakra-ui/react';
import {
  StandardSubLevelEnum,
  standardSubLevelMap
} from '@fastgpt/global/support/wallet/sub/constants';
import type {
  StandSubPlanLevelMapType,
  TeamStandardSubPlanItemType
} from '@fastgpt/global/support/wallet/sub/type';
import { useTranslation } from 'next-i18next';
import React, { useMemo, useState } from 'react';
import {
  FeatureRow,
  getColumnFeatures,
  EditPlanModal
} from '@/components/admin/Settings/PlanComponents';

const LegacyPlans = ({
  value,
  onChange
}: {
  value: StandSubPlanLevelMapType;
  onChange: (value: StandSubPlanLevelMapType) => void;
}) => {
  const { t } = useTranslation();
  const [editedLevel, setEditedLevel] = useState<StandardSubLevelEnum>();

  // 解析并检查是否有旧版套餐数据
  const planMap = useMemo<
    Record<
      StandardSubLevelEnum.experience | StandardSubLevelEnum.team | StandardSubLevelEnum.enterprise,
      TeamStandardSubPlanItemType | undefined
    >
  >(() => {
    return {
      [StandardSubLevelEnum.experience]: value[StandardSubLevelEnum.experience],
      [StandardSubLevelEnum.team]: value[StandardSubLevelEnum.team],
      [StandardSubLevelEnum.enterprise]: value[StandardSubLevelEnum.enterprise]
    };
  }, [value]);

  const levels = useMemo<
    [StandardSubLevelEnum.experience, StandardSubLevelEnum.team, StandardSubLevelEnum.enterprise]
  >(
    () => [
      StandardSubLevelEnum.experience,
      StandardSubLevelEnum.team,
      StandardSubLevelEnum.enterprise
    ],
    []
  );

  const planData = useMemo(() => {
    const columnsFeatures = levels.map((level) => getColumnFeatures(planMap[level], t));
    const maxRows = Math.max(...columnsFeatures.map((col) => col.length));
    const featureRows: string[][] = [];
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
      featureRows.push([
        columnsFeatures[0][rowIndex] || '',
        columnsFeatures[1][rowIndex] || '',
        columnsFeatures[2][rowIndex] || ''
      ]);
    }

    return {
      labels: levels.map((level) => planMap[level]?.name || t(standardSubLevelMap[level].label)),
      prices: levels.map((level) => `￥${planMap[level]?.price ?? 0}`),
      features: featureRows
    };
  }, [planMap, t, levels]);

  return (
    <>
      <Box
        mt={2}
        w={'100%'}
        minH={'550px'}
        border={'1px solid'}
        borderColor={'myGray.200'}
        borderRadius={'md'}
        bg={'white'}
      >
        {/* 头部 - 套餐名称 */}
        <Grid
          gridTemplateColumns={'repeat(3, 1fr)'}
          w={'100%'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          {planData.labels.map((label, index) => (
            <Flex
              key={index}
              alignItems={'center'}
              px={4}
              h={12}
              fontSize={'14px'}
              fontWeight={'medium'}
              color={'myGray.600'}
            >
              {label}
            </Flex>
          ))}
        </Grid>

        {/* 配置按钮行 */}
        <Grid
          gridTemplateColumns={'repeat(3, 1fr)'}
          w={'100%'}
          borderBottom={'1px solid'}
          borderColor={'myGray.200'}
        >
          {levels.map((level, index) => (
            <Flex key={index} alignItems={'center'} px={4} h={12}>
              <Button variant={'primaryOutline'} size={'xs'} onClick={() => setEditedLevel(level)}>
                点击配置套餐
              </Button>
            </Flex>
          ))}
        </Grid>

        {/* 价格行 */}
        <FeatureRow values={planData.prices} />

        {/* 特性行 */}
        {planData.features.map((featureRow, index) => (
          <FeatureRow key={index} values={featureRow} />
        ))}
      </Box>

      {!!editedLevel && (
        <EditPlanModal
          level={editedLevel}
          value={value}
          onChange={onChange}
          onClose={() => setEditedLevel(undefined)}
          isLegacy={true}
        />
      )}
    </>
  );
};

export default React.memo(LegacyPlans);

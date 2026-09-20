import { Box, Button, Flex, Grid, Input } from '@chakra-ui/react';
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
import { useForm } from 'react-hook-form';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import FormLabel from '@fastgpt/web/components/common/MyBox/FormLabel';
import {
  FeatureRow,
  getColumnFeatures,
  EditPlanModal
} from '@/components/admin/Settings/PlanComponents';

const CustomPlanModal = ({
  planMap,
  onClose,
  onChange
}: {
  planMap: StandSubPlanLevelMapType;
  onClose: () => void;
  onChange: (e: StandSubPlanLevelMapType) => void;
}) => {
  const { t } = useTranslation();
  const level = StandardSubLevelEnum.custom;
  const { handleSubmit, watch, setValue } = useForm({
    defaultValues: planMap[level]
  });
  const label = planMap?.[level]?.name || t(standardSubLevelMap[level].label);

  const onSubmit = (data: TeamStandardSubPlanItemType) => {
    onChange({
      ...planMap,
      [level]: data
    });
    onClose();
  };

  return (
    <MyModal
      isOpen
      title={`${label}套餐配置`}
      isCentered
      minW={'800px'}
      maxH={'90vh'}
      footer={
        <>
          <Button variant={'whiteBase'} onClick={onClose}>
            取消
          </Button>
          <Button onClick={handleSubmit(onSubmit)}>确认</Button>
        </>
      }
    >
      {/* 基础信息与定价 */}
      <Flex mb={6} pb={6} gap={8} borderBottomWidth={'1px'} borderBottomColor={'myGray.200'}>
        <FormLabel fontSize={'md'} fontWeight={'medium'} flex={'0 0 160px'}>
          基础信息与定价
        </FormLabel>
        <Grid flex={1} w={'100%'} templateColumns={'repeat(2, 1fr)'} gap={4}>
          <Box>
            <FormLabel mb={2}>套餐名称</FormLabel>
            <Input
              bg={'myGray.50'}
              value={watch('name')}
              onChange={(e) => {
                setValue('name', e.target.value ?? '');
              }}
              placeholder="定制版"
            />
          </Box>
          {/* <Box>
              <FormLabel mb={2}>价格描述</FormLabel>
              <Input
                bg={'myGray.50'}
                value={watch('priceDescription')}
                onChange={(e) => {
                  // @ts-ignore
                  setValue('priceDescription', e.target.value ?? '');
                }}
                placeholder="在此输入价格描述"
                disabled
              />
            </Box>
            <Box gridColumn="span 2">
              <FormLabel mb={2}>套餐描述</FormLabel>
              <Input
                bg={'myGray.50'}
                value={watch('desc') as any}
                onChange={(e) => {
                  // @ts-ignore
                  setValue('desc', e.target.value ?? '');
                }}
                placeholder={'自定义套餐描述（14字以内）'}
              />
            </Box> */}
        </Grid>
      </Flex>

      {/* 购买链接 */}
      <Flex mb={6} pb={6} gap={8}>
        <FormLabel fontSize={'md'} fontWeight={'medium'} flex={'0 0 160px'}>
          购买链接
        </FormLabel>
        <Grid flex={1} w={'100%'} templateColumns={'repeat(2, 1fr)'} gap={4}>
          <Box gridColumn="span 2">
            <FormLabel mb={2}>套餐购买链接</FormLabel>
            <Input
              bg={'myGray.50'}
              value={watch('customFormUrl')}
              onChange={(e) => {
                setValue('customFormUrl', e.target.value ?? '');
              }}
              placeholder="在此输入购买链接"
            />
          </Box>
        </Grid>
      </Flex>

      {/* 自定义描述 */}
      {/* <Flex mb={6} gap={8}>
          <FormLabel fontSize={'md'} fontWeight={'medium'} flex={'0 0 160px'}>
            自定义描述
          </FormLabel>
          <Grid flex={1} w={'100%'} templateColumns={'repeat(2, 1fr)'} gap={4}>
            {customDescriptions.map((desc, index) => (
              <Box key={index}>
                <FormLabel mb={2}>自定义描述{index + 1}</FormLabel>
                <Input
                  bg={'myGray.50'}
                  value={desc}
                  onChange={(e) => handleCustomDescChange(index, e.target.value)}
                  onBlur={(e) => handleCustomDescBlur(index, e.target.value)}
                  placeholder={`自定义套餐描述（14字以内）`}
                  disabled
                />
              </Box>
            ))}
          </Grid>
        </Flex> */}
    </MyModal>
  );
};

const StandardPlans = ({
  value,
  onChange
}: {
  value: StandSubPlanLevelMapType;
  onChange: (value: StandSubPlanLevelMapType) => void;
}) => {
  const { t } = useTranslation();
  const [editedLevel, setEditedLevel] = useState<StandardSubLevelEnum | 'custom'>();

  const levels = useMemo(
    () => [
      StandardSubLevelEnum.free,
      StandardSubLevelEnum.basic,
      StandardSubLevelEnum.advanced,
      StandardSubLevelEnum.custom
    ],
    []
  );

  const planData = useMemo(() => {
    const customPlan = value[StandardSubLevelEnum.custom];

    const getFeatures = (level: StandardSubLevelEnum | 'custom'): string[] => {
      if (level === StandardSubLevelEnum.custom) {
        return [
          t('common:custom_plan_feature_1'),
          t('common:custom_plan_feature_2'),
          t('common:custom_plan_feature_3'),
          t('common:custom_plan_feature_4')
        ];
      }
      return getColumnFeatures(value[level], t);
    };

    const columnsFeatures = levels.map((level) => getFeatures(level));
    const maxRows = Math.max(...columnsFeatures.map((col) => col.length));
    const featureRows: string[][] = [];
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex++) {
      featureRows.push([
        columnsFeatures[0][rowIndex] || '',
        columnsFeatures[1][rowIndex] || '',
        columnsFeatures[2][rowIndex] || '',
        columnsFeatures[3][rowIndex] || ''
      ]);
    }

    return {
      labels: levels.map((level) =>
        level === StandardSubLevelEnum.custom
          ? customPlan?.name || t(standardSubLevelMap[level].label)
          : value[level]?.name || t(standardSubLevelMap[level].label)
      ),
      prices: levels.map((level) =>
        level === StandardSubLevelEnum.custom
          ? t('common:custom_plan_price')
          : `￥${value[level]?.price ?? 0}`
      ),
      features: featureRows
    };
  }, [value, t, levels]);

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
          gridTemplateColumns={'repeat(4, 1fr)'}
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
          gridTemplateColumns={'repeat(4, 1fr)'}
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

      {!!editedLevel && editedLevel === StandardSubLevelEnum.custom && (
        <CustomPlanModal
          planMap={value}
          onChange={onChange}
          onClose={() => setEditedLevel(undefined)}
        />
      )}

      {!!editedLevel && editedLevel !== StandardSubLevelEnum.custom && (
        <EditPlanModal
          level={editedLevel}
          value={value}
          onChange={onChange}
          onClose={() => setEditedLevel(undefined)}
        />
      )}
    </>
  );
};

export default React.memo(StandardPlans);

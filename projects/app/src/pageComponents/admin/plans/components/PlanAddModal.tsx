import { useClientTranslation } from '@fastgpt/web/i18n/useClientTranslation';
import { Box, Button, FormControl, FormLabel, Input, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { addPlan } from '@/web/admin/wallet/plan/api';
import { AddIcon } from '@chakra-ui/icons';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { StandardSubLevelEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useRequest } from '@fastgpt/web/hooks/useRequest';

type TFormData = {
  teamId: string; // 团队id
  type: SubTypeEnum; // 套餐类型
  startTime: string; // 开始时间
  expiredTime: string; // 结束时间
  price: number; // 价格
  level: StandardSubLevelEnum; // 套餐等级
  extraDatasetSize: number; // 额外知识库容量
  totalPoints: number; // 总积分
  surplusPoints: number; // 剩余积分
};

const defaultData: TFormData = {
  teamId: '',
  type: SubTypeEnum.standard,
  startTime: new Date().toISOString(),
  expiredTime: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  level: StandardSubLevelEnum.basic,
  price: 0,
  extraDatasetSize: 0,
  totalPoints: 0,
  surplusPoints: 0
};

export default function PlanAddModal(props: { updateData: any }) {
  const { t } = useClientTranslation('admin');
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { updateData } = props;
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
    watch
  } = useForm<TFormData>({
    defaultValues: defaultData
  });

  const currentType = watch('type');

  const { runAsync: onSubmit, loading } = useRequest(async (formData: TFormData) => {
    try {
      const startTimeISO = new Date(formData.startTime).toISOString();
      const expiredTimeISO = new Date(formData.expiredTime).toISOString();
      if (startTimeISO >= expiredTimeISO) {
        throw new Error('开始时间不能大于结束时间');
      }
      if (formData.surplusPoints > formData.totalPoints) {
        throw new Error('剩余积分不能大于总积分');
      }
      await addPlan({
        ...formData,
        startTime: startTimeISO,
        expiredTime: expiredTimeISO
      });
      toast({
        title: t('admin:added'),
        status: 'success'
      });
      updateData();
      onClose();
    } catch (error: any) {
      toast({
        title: error.message,
        status: 'error'
      });
    }
  });

  return (
    <>
      <Button
        variant="primary"
        h="36px"
        leftIcon={<AddIcon boxSize={2} />}
        onClick={() => {
          onOpen();
          reset(defaultData);
        }}
      >
        {t('admin:add_plan')}
      </Button>

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title={'添加套餐'}
        maxW={['90vw', '700px']}
        footer={
          <>
            <Button variant="whiteBase" onClick={onClose}>
              {t('admin:close')}
            </Button>
            <Button variant="primary" onClick={handleSubmit(onSubmit)} isLoading={loading}>
              {t('admin:ok')}
            </Button>
          </>
        }
      >
        <FormControl>
          <FormLabel htmlFor="teamId" fontWeight="bold">
            {t('admin:team_id_3')}
          </FormLabel>
          <Input
            {...register('teamId', {
              required: 'This is required'
            })}
            id="teamId"
            variant="outline"
            placeholder={t('admin:team_id_3')}
          />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel htmlFor="type" fontWeight="bold">
            {t('admin:plan_type')}
          </FormLabel>
          <Controller
            control={control}
            name="type"
            render={({ field: { value, onChange } }) => (
              <MySelect
                h={10}
                value={value}
                onChange={(value) => {
                  onChange(value);
                }}
                list={[
                  { label: t('admin:basic_plan'), value: SubTypeEnum.standard },
                  {
                    label: t('admin:dataset_storage_expansion'),
                    value: SubTypeEnum.extraDatasetSize
                  },
                  { label: t('admin:ai_points_package'), value: SubTypeEnum.extraPoints }
                ]}
              />
            )}
          />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel htmlFor="startTime" fontWeight="bold">
            {t('admin:start_time')}
            {errors && !!errors?.startTime && (
              <Box as="span" ml={2} fontSize="12px" color="red.500">
                {t('admin:required')}
              </Box>
            )}
          </FormLabel>
          <Input
            size="md"
            type="datetime-local"
            {...register('startTime', {
              required: 'This is required'
            })}
          />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel htmlFor="expiredTime" fontWeight="bold">
            {t('admin:end_time')}
            {errors && !!errors?.expiredTime && (
              <Box as="span" ml={2} fontSize="12px" color="red.500">
                {t('admin:required')}
              </Box>
            )}
          </FormLabel>
          <Input
            size="md"
            type="datetime-local"
            {...register('expiredTime', {
              required: 'This is required'
            })}
          />
        </FormControl>

        {currentType === SubTypeEnum.standard && (
          <FormControl mt={4}>
            <FormLabel htmlFor="level" fontWeight="bold">
              {t('admin:plan_tier')}
            </FormLabel>
            <Controller
              control={control}
              name="level"
              render={({ field: { value, onChange } }) => (
                <MySelect
                  h={10}
                  value={value}
                  onChange={onChange}
                  list={[
                    { label: t('admin:free_edition'), value: StandardSubLevelEnum.free },
                    { label: t('admin:basic_edition'), value: StandardSubLevelEnum.basic },
                    { label: t('admin:advanced_edition'), value: StandardSubLevelEnum.advanced },
                    { label: t('admin:custom'), value: StandardSubLevelEnum.custom }
                  ]}
                />
              )}
            />
          </FormControl>
        )}
        {currentType === SubTypeEnum.extraDatasetSize && (
          <FormControl mt={4}>
            <FormLabel htmlFor="extraDatasetSize" fontWeight="bold">
              {t('admin:extra_dataset_storage')}
              {errors && !!errors?.extraDatasetSize && (
                <Box as="span" ml={2} fontSize="12px" color="red.500">
                  {t('admin:required')}
                </Box>
              )}
            </FormLabel>
            <Input
              {...register('extraDatasetSize', {
                required: 'This is required'
              })}
              id="metadata"
              variant="outline"
              placeholder={t('admin:extra_dataset_storage')}
              type="number"
            />
          </FormControl>
        )}
        {(currentType === SubTypeEnum.extraPoints || currentType === SubTypeEnum.standard) && (
          <>
            <FormControl mt={4}>
              <FormLabel htmlFor="totalPoints" fontWeight="bold">
                {t('admin:total_points')}
                {errors && !!errors?.totalPoints && (
                  <Box as="span" ml={2} fontSize="12px" color="red.500">
                    {t('admin:required')}
                  </Box>
                )}
              </FormLabel>
              <Input
                {...register('totalPoints', {
                  required: 'This is required'
                })}
                id="metadata"
                variant="outline"
                placeholder={t('admin:total_points')}
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="surplusPoints" fontWeight="bold">
                {t('admin:remaining_points')}
                {errors && !!errors?.surplusPoints && (
                  <Box as="span" ml={2} fontSize="12px" color="red.500">
                    {t('admin:required')}
                  </Box>
                )}
              </FormLabel>
              <Input
                {...register('surplusPoints', {
                  required: 'This is required'
                })}
                id="metadata"
                variant="outline"
                placeholder={t('admin:remaining_points')}
                type="number"
              />
            </FormControl>
          </>
        )}

        <FormControl mt={4}>
          <FormLabel htmlFor="price" fontWeight="bold">
            {t('admin:price_cny_for_reference_only')}
          </FormLabel>
          <Input
            {...register('price', {
              required: 'This is required'
            })}
            id="price"
            variant="outline"
            placeholder={t('admin:price')}
            type="number"
          />
        </FormControl>
      </MyModal>
    </>
  );
}

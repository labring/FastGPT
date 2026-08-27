import { Box, Button, FormControl, FormLabel, Input, useDisclosure } from '@chakra-ui/react';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { POST } from '@/web/admin/common/request';
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
      await POST(`/proApi/admin/routes/plans/addPlans`, {
        ...formData,
        startTime: startTimeISO,
        expiredTime: expiredTimeISO
      });
      toast({
        title: '添加成功',
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
        variant="outline"
        h="100%"
        leftIcon={<AddIcon boxSize={2} />}
        onClick={() => {
          onOpen();
          reset(defaultData);
        }}
      >
        添加套餐
      </Button>

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title={'添加套餐'}
        maxW={['90vw', '700px']}
        footer={
          <>
            <Button variant="whiteBase" onClick={onClose}>
              关闭
            </Button>
            <Button variant="primary" onClick={handleSubmit(onSubmit)} isLoading={loading}>
              确定
            </Button>
          </>
        }
      >
        <FormControl>
          <FormLabel htmlFor="teamId" fontWeight="bold">
            团队id
          </FormLabel>
          <Input
            {...register('teamId', {
              required: 'This is required'
            })}
            id="teamId"
            variant="outline"
            placeholder="团队id"
          />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel htmlFor="type" fontWeight="bold">
            套餐类型
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
                  { label: '基础套餐', value: SubTypeEnum.standard },
                  { label: '知识库扩容', value: SubTypeEnum.extraDatasetSize },
                  { label: 'AI 积分套餐', value: SubTypeEnum.extraPoints }
                ]}
              />
            )}
          />
        </FormControl>
        <FormControl mt={4}>
          <FormLabel htmlFor="startTime" fontWeight="bold">
            开始时间
            {errors && !!errors?.startTime && (
              <Box as="span" ml={2} fontSize="12px" color="red.500">
                *必填
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
            结束时间
            {errors && !!errors?.expiredTime && (
              <Box as="span" ml={2} fontSize="12px" color="red.500">
                *必填
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
              套餐等级
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
                    { label: '免费版', value: StandardSubLevelEnum.free },
                    { label: '基础版', value: StandardSubLevelEnum.basic },
                    { label: '高级版', value: StandardSubLevelEnum.advanced },
                    { label: '定制版', value: StandardSubLevelEnum.custom }
                  ]}
                />
              )}
            />
          </FormControl>
        )}
        {currentType === SubTypeEnum.extraDatasetSize && (
          <FormControl mt={4}>
            <FormLabel htmlFor="extraDatasetSize" fontWeight="bold">
              额外知识库容量
              {errors && !!errors?.extraDatasetSize && (
                <Box as="span" ml={2} fontSize="12px" color="red.500">
                  *必填
                </Box>
              )}
            </FormLabel>
            <Input
              {...register('extraDatasetSize', {
                required: 'This is required'
              })}
              id="metadata"
              variant="outline"
              placeholder="额外知识库容量"
              type="number"
            />
          </FormControl>
        )}
        {(currentType === SubTypeEnum.extraPoints || currentType === SubTypeEnum.standard) && (
          <>
            <FormControl mt={4}>
              <FormLabel htmlFor="totalPoints" fontWeight="bold">
                总积分
                {errors && !!errors?.totalPoints && (
                  <Box as="span" ml={2} fontSize="12px" color="red.500">
                    *必填
                  </Box>
                )}
              </FormLabel>
              <Input
                {...register('totalPoints', {
                  required: 'This is required'
                })}
                id="metadata"
                variant="outline"
                placeholder="总积分"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="surplusPoints" fontWeight="bold">
                剩余积分
                {errors && !!errors?.surplusPoints && (
                  <Box as="span" ml={2} fontSize="12px" color="red.500">
                    *必填
                  </Box>
                )}
              </FormLabel>
              <Input
                {...register('surplusPoints', {
                  required: 'This is required'
                })}
                id="metadata"
                variant="outline"
                placeholder="剩余积分"
                type="number"
              />
            </FormControl>
          </>
        )}

        <FormControl mt={4}>
          <FormLabel htmlFor="price" fontWeight="bold">
            价格(元)-仅用于记录
          </FormLabel>
          <Input
            {...register('price', {
              required: 'This is required'
            })}
            id="price"
            variant="outline"
            placeholder="价格"
            type="number"
          />
        </FormControl>
      </MyModal>
    </>
  );
}

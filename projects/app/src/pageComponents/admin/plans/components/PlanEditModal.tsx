import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  Select,
  useDisclosure
} from '@chakra-ui/react';
import React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { POST } from '@/web/admin/common/request';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { StandardSubLevelEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
import type { AdminPlanType as PlanType } from '@/web/admin/users/api';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import MyDivider from '@fastgpt/web/components/common/MyDivider';

function transformDate(date: string) {
  const initialDate = new Date(date);
  const year = initialDate.getFullYear();
  const month = String(initialDate.getMonth() + 1).padStart(2, '0');
  const day = String(initialDate.getDate()).padStart(2, '0');
  const hours = String(initialDate.getHours()).padStart(2, '0');
  const minutes = String(initialDate.getMinutes()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function PlanEditModal(props: {
  data: PlanType;
  getData: any;
  subType: `${SubTypeEnum}`;
}) {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { data, getData, subType } = props;
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors }
  } = useForm<PlanType>({
    defaultValues: {
      id: '',
      teamId: '',
      teamName: '',
      userName: '',
      type: SubTypeEnum.standard,
      level: StandardSubLevelEnum.basic,
      createTime: '',
      expiredTime: '',
      startTime: '',
      totalPoints: 0,
      surplusPoints: 0,
      extraDatasetSize: 0,
      maxTeamMember: undefined,
      maxApp: undefined,
      maxDataset: undefined,
      maxDatasetSize: undefined,
      requestsPerMinute: undefined,
      websiteSyncPerDataset: undefined,
      chatHistoryStoreDuration: undefined,
      appRegistrationCount: undefined,
      auditLogStoreDuration: undefined,
      ticketResponseTime: undefined,
      customDomain: undefined,
      maxUploadFileSize: undefined,
      maxUploadFileCount: undefined,
      enableSandbox: undefined
    }
  });

  const { runAsync: onSubmit, loading } = useRequest(async (formData: PlanType) => {
    try {
      const startTimeISO = new Date(formData.startTime).toISOString();
      const expiredTimeISO = new Date(formData.expiredTime).toISOString();
      if (startTimeISO >= expiredTimeISO) {
        throw new Error('开始时间不能大于结束时间');
      }
      if (Number(formData.surplusPoints) > Number(formData.totalPoints)) {
        throw new Error('剩余积分不能大于总积分');
      }

      await POST(`/proApi/admin/routes/plans/updatePlan`, {
        id: data.id,
        type: formData.type,
        startTime: startTimeISO,
        expiredTime: expiredTimeISO,
        price: 0,
        totalPoints: formData.totalPoints,
        surplusPoints: formData.surplusPoints,
        extraDatasetSize: formData.extraDatasetSize,
        level: formData.level,

        maxTeamMember: formData.maxTeamMember,
        maxApp: formData.maxApp,
        maxDataset: formData.maxDataset,
        maxDatasetSize: formData.maxDatasetSize,
        requestsPerMinute: formData.requestsPerMinute,
        websiteSyncPerDataset: formData.websiteSyncPerDataset,
        chatHistoryStoreDuration: formData.chatHistoryStoreDuration,
        appRegistrationCount: formData.appRegistrationCount,
        auditLogStoreDuration: formData.auditLogStoreDuration,
        ticketResponseTime: formData.ticketResponseTime,
        customDomain: formData.customDomain,
        maxUploadFileSize: formData.maxUploadFileSize,
        maxUploadFileCount: formData.maxUploadFileCount,
        enableSandbox: formData.enableSandbox
      });
      toast({
        title: '更新成功',
        status: 'success'
      });
      getData(1);
      onClose();
    } catch (err: any) {
      toast({
        title: err.message,
        status: 'error'
      });
    }
  });

  return (
    <>
      <Button
        variant={'whiteBase'}
        size={'sm'}
        onClick={() => {
          onOpen();
          reset({
            ...data,
            startTime: transformDate(data.startTime),
            expiredTime: transformDate(data.expiredTime)
          });
        }}
      >
        编辑
      </Button>

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title={'编辑套餐'}
        maxW={['90vw', '700px']}
        footer={
          <>
            <Button variant={'whiteBase'} onClick={onClose}>
              关闭
            </Button>
            <Button isLoading={loading} variant={'primary'} onClick={handleSubmit(onSubmit)}>
              确定
            </Button>
          </>
        }
      >
        <FormControl mt={4}>
          <FormLabel htmlFor="startTime" fontWeight="bold">
            开始时间
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
          </FormLabel>
          <Input
            size="md"
            type="datetime-local"
            {...register('expiredTime', {
              required: 'This is required'
            })}
          />
        </FormControl>
        {subType === SubTypeEnum.standard && (
          <>
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
                      { label: '定制版', value: StandardSubLevelEnum.custom },

                      // deprecated
                      { label: '体验版', value: StandardSubLevelEnum.experience },
                      { label: '团队版', value: StandardSubLevelEnum.team },
                      { label: '企业版', value: StandardSubLevelEnum.enterprise }
                    ]}
                  />
                )}
              />
            </FormControl>
          </>
        )}
        {subType === SubTypeEnum.extraDatasetSize ? (
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
        ) : (
          <>
            <FormControl mt={4}>
              <FormLabel htmlFor="totalPoints" fontWeight="bold">
                总积分
              </FormLabel>
              <Input
                {...register('totalPoints', {
                  required: 'This is required'
                })}
                id="totalPoints"
                variant="outline"
                placeholder="总积分"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="surplusPoints" fontWeight="bold">
                剩余积分
              </FormLabel>
              <Input
                {...register('surplusPoints', {
                  required: 'This is required'
                })}
                id="surplusPoints"
                variant="outline"
                placeholder="剩余积分"
                type="number"
              />
            </FormControl>
          </>
        )}
        {subType === SubTypeEnum.standard && (
          <>
            <MyDivider />
            <Box mt={4}>下面的值会覆盖套餐配置，不填则会用套餐的标准值</Box>
            <FormControl>
              <FormLabel htmlFor="totalPoints" fontWeight={'bold'}>
                团队成员上限
              </FormLabel>
              <Input
                {...register('maxTeamMember')}
                id="totalPoints"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="totalPoints" fontWeight={'bold'}>
                应用上限
              </FormLabel>
              <Input {...register('maxApp')} id="totalPoints" variant="outline" type="number" />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="totalPoints" fontWeight={'bold'}>
                知识库上限
              </FormLabel>
              <Input {...register('maxDataset')} id="totalPoints" variant="outline" type="number" />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="maxDatasetSize" fontWeight={'bold'}>
                知识库索引容量上限
              </FormLabel>
              <Input
                {...register('maxDatasetSize')}
                id="maxDatasetSize"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="requestsPerMinute" fontWeight={'bold'}>
                QPM
              </FormLabel>
              <Input
                {...register('requestsPerMinute')}
                id="requestsPerMinute"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="websiteSyncPerDataset" fontWeight={'bold'}>
                单个知识库网页同步数量
              </FormLabel>
              <Input
                {...register('websiteSyncPerDataset')}
                id="websiteSyncPerDataset"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="chatHistoryStoreDuration" fontWeight={'bold'}>
                对话记录保存时长（天）
              </FormLabel>
              <Input
                {...register('chatHistoryStoreDuration')}
                id="chatHistoryStoreDuration"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="appRegistrationCount" fontWeight={'bold'}>
                应用备案数量上限
              </FormLabel>
              <Input
                {...register('appRegistrationCount')}
                id="appRegistrationCount"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="auditLogStoreDuration" fontWeight={'bold'}>
                审计日志保存时间（天）
              </FormLabel>
              <Input
                {...register('auditLogStoreDuration')}
                id="auditLogStoreDuration"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="ticketResponseTime" fontWeight={'bold'}>
                工单支持响应时间（小时）
              </FormLabel>
              <Input
                {...register('ticketResponseTime')}
                id="ticketResponseTime"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="customDomain" fontWeight={'bold'}>
                自定义域名数量
              </FormLabel>
              <Input
                {...register('customDomain')}
                id="customDomain"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="maxUploadFileSize" fontWeight={'bold'}>
                最大上传文件大小（MB）
              </FormLabel>
              <Input
                {...register('maxUploadFileSize')}
                id="maxUploadFileSize"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="maxUploadFileCount" fontWeight={'bold'}>
                最大上传文件数量
              </FormLabel>
              <Input
                {...register('maxUploadFileCount')}
                id="maxUploadFileCount"
                variant="outline"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="enableSandbox" fontWeight={'bold'}>
                虚拟机
              </FormLabel>
              <Controller
                control={control}
                name="enableSandbox"
                render={({ field: { value, onChange } }) => (
                  <Select
                    value={value === undefined ? 'inherit' : value ? 'enabled' : 'disabled'}
                    onChange={(e) => {
                      const selectValue = e.target.value;
                      onChange(selectValue === 'inherit' ? undefined : selectValue === 'enabled');
                    }}
                  >
                    <option value="inherit">跟随套餐</option>
                    <option value="enabled">启用</option>
                    <option value="disabled">禁止</option>
                  </Select>
                )}
              />
            </FormControl>
          </>
        )}
      </MyModal>
    </>
  );
}

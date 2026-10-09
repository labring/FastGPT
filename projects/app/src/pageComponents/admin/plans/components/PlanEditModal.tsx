import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
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
import { updatePlan, type AdminPlanType } from '@/web/admin/wallet/plan/api';
import { useToast } from '@fastgpt/web/hooks/useToast';
import MyModal from '@fastgpt/web/components/v2/common/MyModal';
import { StandardSubLevelEnum, SubTypeEnum } from '@fastgpt/global/support/wallet/sub/constants';
import MySelect from '@fastgpt/web/components/common/MySelect';
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

const formatOptionalNumber = (val: unknown) => {
  if (val === '' || val === null || val === undefined) return undefined;
  const num = Number(val);
  return Number.isNaN(num) ? undefined : num;
};

export default function PlanEditModal(props: {
  data: AdminPlanType;
  getData: any;
  subType: `${SubTypeEnum}`;
}) {
  const { t } = useSafeTranslation();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { data, getData, subType } = props;
  const { toast } = useToast();

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors }
  } = useForm<AdminPlanType>({
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

  const { runAsync: onSubmit, loading } = useRequest(async (formData: AdminPlanType) => {
    try {
      const startTimeISO = new Date(formData.startTime).toISOString();
      const expiredTimeISO = new Date(formData.expiredTime).toISOString();
      if (startTimeISO >= expiredTimeISO) {
        throw new Error('开始时间不能大于结束时间');
      }
      if (Number(formData.surplusPoints) > Number(formData.totalPoints)) {
        throw new Error('剩余积分不能大于总积分');
      }

      await updatePlan({
        id: data.id,
        type: formData.type,
        startTime: startTimeISO,
        expiredTime: expiredTimeISO,
        price: 0,
        totalPoints: formData.totalPoints,
        surplusPoints: formData.surplusPoints,
        extraDatasetSize: formData.extraDatasetSize,
        level: formData.level,

        maxTeamMember: formatOptionalNumber(formData.maxTeamMember),
        maxApp: formatOptionalNumber(formData.maxApp),
        maxDataset: formatOptionalNumber(formData.maxDataset),
        maxDatasetSize: formatOptionalNumber(formData.maxDatasetSize),
        requestsPerMinute: formatOptionalNumber(formData.requestsPerMinute),
        websiteSyncPerDataset: formatOptionalNumber(formData.websiteSyncPerDataset),
        chatHistoryStoreDuration: formatOptionalNumber(formData.chatHistoryStoreDuration),
        appRegistrationCount: formatOptionalNumber(formData.appRegistrationCount),
        auditLogStoreDuration: formatOptionalNumber(formData.auditLogStoreDuration),
        ticketResponseTime: formatOptionalNumber(formData.ticketResponseTime),
        customDomain: formatOptionalNumber(formData.customDomain),
        maxUploadFileSize: formatOptionalNumber(formData.maxUploadFileSize),
        maxUploadFileCount: formatOptionalNumber(formData.maxUploadFileCount),
        enableSandbox: formData.enableSandbox
      });
      toast({
        title: t('admin:updated_success'),
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
            expiredTime: transformDate(data.expiredTime),
            maxTeamMember: data.maxTeamMember ?? undefined,
            maxApp: data.maxApp ?? undefined,
            maxDataset: data.maxDataset ?? undefined,
            maxDatasetSize: data.maxDatasetSize ?? undefined,
            requestsPerMinute: data.requestsPerMinute ?? undefined,
            websiteSyncPerDataset: data.websiteSyncPerDataset ?? undefined,
            chatHistoryStoreDuration: data.chatHistoryStoreDuration ?? undefined,
            appRegistrationCount: data.appRegistrationCount ?? undefined,
            auditLogStoreDuration: data.auditLogStoreDuration ?? undefined,
            ticketResponseTime: data.ticketResponseTime ?? undefined,
            customDomain: data.customDomain ?? undefined,
            maxUploadFileSize: data.maxUploadFileSize ?? undefined,
            maxUploadFileCount: data.maxUploadFileCount ?? undefined,
            enableSandbox: data.enableSandbox ?? undefined
          });
        }}
      >
        {t('admin:edit')}
      </Button>

      <MyModal
        isOpen={isOpen}
        onClose={onClose}
        title={'编辑套餐'}
        maxW={['90vw', '700px']}
        footer={
          <>
            <Button variant={'whiteBase'} onClick={onClose}>
              {t('admin:close')}
            </Button>
            <Button isLoading={loading} variant={'primary'} onClick={handleSubmit(onSubmit)}>
              {t('admin:ok')}
            </Button>
          </>
        }
      >
        <FormControl mt={4}>
          <FormLabel htmlFor="startTime" fontWeight="bold">
            {t('admin:start_time')}
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
                      { label: t('admin:custom'), value: StandardSubLevelEnum.custom },

                      // deprecated
                      { label: t('admin:trial'), value: StandardSubLevelEnum.experience },
                      { label: t('admin:team_edition'), value: StandardSubLevelEnum.team },
                      {
                        label: t('admin:enterprise_edition'),
                        value: StandardSubLevelEnum.enterprise
                      }
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
              id="extraDatasetSize"
              variant="outline"
              placeholder={t('admin:extra_dataset_storage')}
              type="number"
            />
          </FormControl>
        ) : (
          <>
            <FormControl mt={4}>
              <FormLabel htmlFor="totalPoints" fontWeight="bold">
                {t('admin:total_points')}
              </FormLabel>
              <Input
                {...register('totalPoints', {
                  required: 'This is required'
                })}
                id="totalPoints"
                variant="outline"
                placeholder={t('admin:total_points')}
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="surplusPoints" fontWeight="bold">
                {t('admin:remaining_points')}
              </FormLabel>
              <Input
                {...register('surplusPoints', {
                  required: 'This is required'
                })}
                id="surplusPoints"
                variant="outline"
                placeholder={t('admin:remaining_points')}
                type="number"
              />
            </FormControl>
          </>
        )}
        {subType === SubTypeEnum.standard && (
          <>
            <MyDivider />
            <Box mt={4}>
              {t('admin:these_values_override_the_plan_configuration_leave_empty_to')}
            </Box>
            <FormControl>
              <FormLabel htmlFor="maxTeamMember" fontWeight={'bold'}>
                {t('admin:team_member_limit')}
              </FormLabel>
              <Input
                {...register('maxTeamMember')}
                id="maxTeamMember"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="maxApp" fontWeight={'bold'}>
                {t('admin:app_limit')}
              </FormLabel>
              <Input
                {...register('maxApp')}
                id="maxApp"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="maxDataset" fontWeight={'bold'}>
                {t('admin:dataset_limit')}
              </FormLabel>
              <Input
                {...register('maxDataset')}
                id="maxDataset"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="maxDatasetSize" fontWeight={'bold'}>
                {t('admin:dataset_index_capacity_limit')}
              </FormLabel>
              <Input
                {...register('maxDatasetSize')}
                id="maxDatasetSize"
                variant="outline"
                placeholder="跟随套餐"
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
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="websiteSyncPerDataset" fontWeight={'bold'}>
                {t('admin:website_sync_count_per_dataset')}
              </FormLabel>
              <Input
                {...register('websiteSyncPerDataset')}
                id="websiteSyncPerDataset"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="chatHistoryStoreDuration" fontWeight={'bold'}>
                {t('admin:chat_history_retention_days')}
              </FormLabel>
              <Input
                {...register('chatHistoryStoreDuration')}
                id="chatHistoryStoreDuration"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="appRegistrationCount" fontWeight={'bold'}>
                {t('admin:app_filing_limit')}
              </FormLabel>
              <Input
                {...register('appRegistrationCount')}
                id="appRegistrationCount"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="auditLogStoreDuration" fontWeight={'bold'}>
                {t('admin:audit_log_retention_days')}
              </FormLabel>
              <Input
                {...register('auditLogStoreDuration')}
                id="auditLogStoreDuration"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="ticketResponseTime" fontWeight={'bold'}>
                {t('admin:ticket_support_response_time_hours')}
              </FormLabel>
              <Input
                {...register('ticketResponseTime')}
                id="ticketResponseTime"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="customDomain" fontWeight={'bold'}>
                {t('admin:custom_domain_count')}
              </FormLabel>
              <Input
                {...register('customDomain')}
                id="customDomain"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="maxUploadFileSize" fontWeight={'bold'}>
                {t('admin:max_upload_file_size_mb')}
              </FormLabel>
              <Input
                {...register('maxUploadFileSize')}
                id="maxUploadFileSize"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="maxUploadFileCount" fontWeight={'bold'}>
                {t('admin:max_upload_file_count')}
              </FormLabel>
              <Input
                {...register('maxUploadFileCount')}
                id="maxUploadFileCount"
                variant="outline"
                placeholder="跟随套餐"
                type="number"
              />
            </FormControl>
            <FormControl mt={4}>
              <FormLabel htmlFor="enableSandbox" fontWeight={'bold'}>
                {t('admin:virtual_machine')}
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
                    <option value="inherit">{t('admin:follow_plan')}</option>
                    <option value="enabled">{t('admin:enable')}</option>
                    <option value="disabled">{t('admin:forbidden')}</option>
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

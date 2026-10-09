import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState
} from 'react';
import { Box, Button, Flex, HStack, Input, Switch, Textarea } from '@chakra-ui/react';
import dayjs from 'dayjs';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import QuestionTip from '@fastgpt/web/components/common/MyTooltip/QuestionTip';
import AdminFormItem from '@/pageComponents/admin/settings/AdminFormItem';
import { getInitFormData, postUpdateConfig } from '@/web/admin/system/api';
import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import {
  defaultAuditLogRetentionDays,
  StandardSubLevelEnum
} from '@fastgpt/global/support/wallet/sub/constants';
import type {
  PointsPackageItem,
  StandSubPlanLevelMapType
} from '@fastgpt/global/support/wallet/sub/type';

const StandardPlans = dynamic(
  () => import('@/pageComponents/admin/config/components/FormField/StandardPlans')
);
const LegacyPlans = dynamic(
  () => import('@/pageComponents/admin/config/components/FormField/LegacyPlans')
);
const ExtraPointsPackages = dynamic(
  () => import('@/pageComponents/admin/config/components/FormField/ExtraPointsPackages')
);

let defaultStandardValueJSON = {
  [StandardSubLevelEnum.free]: {
    name: '',
    desc: '',
    price: 0,
    pointPrice: 0,
    totalPoints: 100,
    requestsPerMinute: 30,
    maxTeamMember: 1,
    maxAppAmount: 10,
    maxDatasetAmount: 3,
    chatHistoryStoreDuration: 30,
    maxDatasetSize: 600,
    annualBonusPoints: 0
  },
  [StandardSubLevelEnum.basic]: {
    name: '',
    desc: '',
    price: 99,
    pointPrice: 0,
    totalPoints: 4000,
    requestsPerMinute: 300,
    maxTeamMember: 5,
    maxAppAmount: 50,
    maxDatasetAmount: 30,
    chatHistoryStoreDuration: 180,
    auditLogStoreDuration: defaultAuditLogRetentionDays[StandardSubLevelEnum.basic],
    maxDatasetSize: 6000,
    websiteSyncPerDataset: 500,
    ticketResponseTime: 48,
    annualBonusPoints: 0
  },
  [StandardSubLevelEnum.advanced]: {
    name: '',
    desc: '',
    price: 599,
    pointPrice: 0,
    totalPoints: 25000,
    requestsPerMinute: 1500,
    maxTeamMember: 50,
    maxAppAmount: 200,
    maxDatasetAmount: 100,
    chatHistoryStoreDuration: 360,
    maxDatasetSize: 36000,
    websiteSyncPerDataset: 2000,
    appRegistrationCount: 3,
    auditLogStoreDuration: defaultAuditLogRetentionDays[StandardSubLevelEnum.advanced],
    ticketResponseTime: 24,
    customDomain: 10,
    annualBonusPoints: 0
  },
  [StandardSubLevelEnum.custom]: {
    name: '',
    customFormUrl: ''
  }
} as StandSubPlanLevelMapType;

let defaultExtraPointPackages: PointsPackageItem[] = [
  { points: 1000, month: 1, price: 15, activityBonusPoints: 0 },
  { points: 3000, month: 1, price: 40, activityBonusPoints: 0 },
  { points: 10000, month: 1, price: 120, activityBonusPoints: 0 }
];

export type PlansSettingSectionHandle = {
  /** 由父页面统一保存按钮调用；表单校验失败时静默跳过。 */
  save: () => Promise<void>;
};

type PlansSettingSectionProps = {
  /** 上报旧通道的保存状态，供父页面统一展示保存中效果。 */
  onSavingChange?: (saving: boolean) => void;
};

/**
 * datetime-local 需要 'YYYY-MM-DDTHH:mm' 字符串，而配置里存的是 Date；这里做双向转换。
 */
const DateInput = ({
  value,
  onChange
}: {
  value?: Date | string;
  onChange: (value: string | undefined) => void;
}) => {
  const text = useMemo(() => {
    if (!value) return '';
    const parsed = dayjs(value);
    return parsed.isValid() ? parsed.format('YYYY-MM-DDTHH:mm') : '';
  }, [value]);

  return (
    <Input
      type={'datetime-local'}
      value={text}
      onChange={(e) => onChange(e.target.value || undefined)}
    />
  );
};

/**
 * 订阅套餐配置区块。
 *
 * subPlans 不在新的 system_instance_configs 11 个 Domain 内，运行时仍由
 * global.subPlans（旧 systemConfigs 集合）读取，因此本区块必须沿用
 * /proApi/admin/system 的读写通道，不能走 useDomainConfig。
 *
 * 保存时先重新拉取一次完整旧配置再合并本次 subPlans 修改，避免用挂载时的
 * 快照覆盖其它管理员并发改动的 feConfigs / systemEnv。
 */
const PlansSettingSection = forwardRef<PlansSettingSectionHandle, PlansSettingSectionProps>(
  (props, ref) => {
    const { onSavingChange } = props;
    const { t } = useSafeTranslation();

    const [openPlan, setOpenPlan] = useState(false);

    const { setValue, reset, watch, register, handleSubmit } =
      useForm<ConfigFormType['paySettings']>();

    const standard = watch('subPlans.standard');
    const extraPointsPackages = watch('subPlans.extraPointsPackages') || [];

    const hasLegacyPlans = useMemo(
      () =>
        !!standard &&
        !!(
          standard[StandardSubLevelEnum.experience] ||
          standard[StandardSubLevelEnum.team] ||
          standard[StandardSubLevelEnum.enterprise]
        ),
      [standard]
    );

    const { loading: loadingConfig, runAsync: loadConfig } = useRequest(getInitFormData, {
      manual: true,
      onSuccess: (data: ConfigStoreType) => {
        const aggregatedConfigs = formatConfigStore2FormSchema(data);
        const loadedPlans = aggregatedConfigs.paySettings.subPlans;

        // 套餐等级补齐默认字段；积分包为空时落回常用档位
        loadedPlans.standard = loadedPlans.standard
          ? { ...defaultStandardValueJSON, ...loadedPlans.standard }
          : undefined;
        loadedPlans.extraPointsPackages =
          loadedPlans.extraPointsPackages ?? defaultExtraPointPackages;

        reset(aggregatedConfigs.paySettings);
        setOpenPlan(!!loadedPlans.standard && Object.keys(loadedPlans.standard).length > 0);
      },
      errorToast: '获取订阅套餐配置出错'
    });

    const { runAsync: saveConfig, loading: loadingSave } = useRequest(postUpdateConfig, {
      manual: true,
      // 成功提示由父页面统一弹出；失败直接抛出，交由父页面的 errorToast 处理，
      // 避免一次保存同时出现订阅套餐与整页配置两条提示。
      errorToast: '订阅套餐保存失败'
    });

    useEffect(() => {
      onSavingChange?.(loadingSave);
    }, [loadingSave, onSavingChange]);

    useEffect(() => {
      void loadConfig();
    }, [loadConfig]);

    const save = useCallback(async () => {
      const formData = await new Promise<ConfigFormType['paySettings'] | undefined>((resolve) => {
        void handleSubmit(
          (data) => resolve(data),
          () => resolve(undefined)
        )();
      });
      if (!formData) return;

      // 提交前重新拉取完整旧配置，只替换 subPlans，避免覆盖并发的其它配置改动
      const latestForm = formatConfigStore2FormSchema(await getInitFormData());

      await saveConfig(
        formatFormData2ConfigStore({
          ...latestForm,
          paySettings: { ...latestForm.paySettings, subPlans: formData.subPlans }
        })
      );

      void loadConfig();
    }, [handleSubmit, loadConfig, saveConfig]);

    useImperativeHandle(ref, () => ({ save }), [save]);

    return (
      <Box>
        <Flex alignItems={'center'} mb={6}>
          <HStack spacing={1.5}>
            <Box fontSize={'sm'} fontWeight={'medium'} color={'myGray.900'}>
              {t('admin:plan_enable_label') || '是否启用订阅套餐'}
            </Box>
            <QuestionTip label={t('admin:plan_enable_tip')} />
          </HStack>
          <Box flex={1} />
          {loadingConfig && (
            <Box fontSize={'xs'} color={'myGray.500'} mr={3}>
              {t('admin:loading')}
            </Box>
          )}
          <Switch
            isChecked={openPlan}
            colorScheme={'blue'}
            onChange={(e) => {
              const checked = e.target.checked;
              if (checked) {
                setValue('subPlans.standard', defaultStandardValueJSON);
                setValue('subPlans.extraPointsPackages', defaultExtraPointPackages);
              } else {
                if (standard) defaultStandardValueJSON = standard;
                if (extraPointsPackages) defaultExtraPointPackages = extraPointsPackages;

                setValue('subPlans.standard', undefined);
                setValue('subPlans.extraPointsPackages', []);
              }
              setOpenPlan(checked);
            }}
          />
        </Flex>

        {openPlan && standard && (
          <>
            <Box mb={6}>
              <AdminFormItem
                label={t('admin:standard_subscription_plans')}
                tooltip={t('admin:includes_free_basic_advanced_and_custom_tiers')}
              >
                <StandardPlans
                  value={standard}
                  onChange={(val) => setValue('subPlans.standard', val)}
                />
              </AdminFormItem>
            </Box>

            {hasLegacyPlans && (
              <Box mb={6}>
                <AdminFormItem
                  label={t('admin:standard_subscription_plans_legacy')}
                  tooltip={t('admin:includes_experience_team_and_enterprise_tiers')}
                >
                  <LegacyPlans
                    value={standard}
                    onChange={(val) => setValue('subPlans.standard', val)}
                  />
                </AdminFormItem>
              </Box>
            )}

            <AdminFormItem
              label={t('admin:dataset_storage_fee_cny_per_1000_records_month')}
              tooltip={t('admin:price_per_1000_records_per_month_after_exceeding_the_plan_s')}
            >
              <Input
                type={'number'}
                {...register('subPlans.extraDatasetSizePrice', { valueAsNumber: true })}
                placeholder="0"
              />
            </AdminFormItem>

            <Box mb={6}>
              <ExtraPointsPackages
                value={extraPointsPackages}
                onChange={(val) => setValue('subPlans.extraPointsPackages', val)}
              />
            </Box>

            <AdminFormItem
              label={t('admin:custom_plan_description')}
              tooltip={t('admin:filling_in_this_url_overrides_the_system_plan_page_and_redir')}
            >
              <Input {...register('subPlans.planDescriptionUrl')} placeholder="https://..." />
            </AdminFormItem>

            <AdminFormItem
              label={t('admin:app_filing_url')}
              tooltip={t('admin:redirect_url_to_guide_users_through_app_filing_applications')}
            >
              <Input {...register('subPlans.appRegistrationUrl')} placeholder="" />
            </AdminFormItem>

            <AdminFormItem
              label={t('admin:community_support_notice')}
              tooltip={t('admin:community_support_notice_shown_when_the_plan_has_no_ticket_s')}
            >
              <Textarea
                {...register('subPlans.communitySupportTip')}
                rows={8}
                whiteSpace={'pre-wrap'}
                wordBreak={'break-word'}
              />
            </AdminFormItem>

            <AdminFormItem
              label={t('admin:campaign_end_time')}
              tooltip={t('admin:campaign_end_time_campaign_copy_stops_showing_afterwards_lea')}
            >
              <Flex gap={2} alignItems={'center'}>
                <DateInput
                  value={watch('subPlans.activityExpirationTime')}
                  onChange={(val) => setValue('subPlans.activityExpirationTime', val as never)}
                />
                <Button
                  size={'sm'}
                  variant={'whiteBase'}
                  onClick={() => setValue('subPlans.activityExpirationTime', undefined as never)}
                >
                  {t('admin:clear')}
                </Button>
              </Flex>
            </AdminFormItem>
          </>
        )}
      </Box>
    );
  }
);

PlansSettingSection.displayName = 'PlansSettingSection';

export default React.memo(PlansSettingSection);

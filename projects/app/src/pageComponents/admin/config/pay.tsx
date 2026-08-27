'use client';
import React, { useMemo, useState } from 'react';
import { Box, Flex, HStack, Switch, Input, Textarea, Button } from '@chakra-ui/react';
import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import { getInitFormData, postUpdateConfig } from '@/web/admin/config/api';
import FormLabel from './components/FormLabel';
import dynamic from 'next/dynamic';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FirstTitle from '@/pageComponents/admin/settings/FirstTitle';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import SecondTitle from '@/pageComponents/admin/settings/SecondTitle';
import FormItem from '@/pageComponents/admin/settings/FormItem';
import {
  defaultAuditLogRetentionDays,
  StandardSubLevelEnum
} from '@fastgpt/global/support/wallet/sub/constants';
import type {
  PointsPackageItem,
  StandSubPlanLevelMapType
} from '@fastgpt/global/support/wallet/sub/type';

const StandardPlans = dynamic(() => import('./components/FormField/StandardPlans'));
const LegacyPlans = dynamic(() => import('./components/FormField/LegacyPlans'));
const ExtraPointsPackages = dynamic(() => import('./components/FormField/ExtraPointsPackages'));
interface titleType {
  mainTitle: string;
  subTitles: string[];
}

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

// [StandardSubLevelEnum.experience]: {
//   name: '',
//   desc: '',
//   price: 0,
//   pointPrice: 0,
//   totalPoints: 0,
//   maxTeamMember: 0,
//   maxAppAmount: 0,
//   maxDatasetAmount: 0,
//   maxDatasetSize: 0,
//   chatHistoryStoreDuration: 0,
//   websiteSyncPerDataset: 0,
//   auditLogStoreDuration: 360
// },
// [StandardSubLevelEnum.team]: {
//   name: '',
//   desc: '',
//   price: 0,
//   pointPrice: 0,
//   totalPoints: 0,
//   maxTeamMember: 0,
//   maxAppAmount: 0,
//   maxDatasetAmount: 0,
//   maxDatasetSize: 0,
//   chatHistoryStoreDuration: 0,
//   websiteSyncPerDataset: 0,
//   auditLogStoreDuration: 1080
// },
// [StandardSubLevelEnum.enterprise]: {
//   name: '',
//   desc: '',
//   price: 0,
//   pointPrice: 0,
//   totalPoints: 0,
//   maxTeamMember: 0,
//   maxAppAmount: 0,
//   maxDatasetAmount: 0,
//   maxDatasetSize: 0,
//   chatHistoryStoreDuration: 0,
//   websiteSyncPerDataset: 0,
//   auditLogStoreDuration: 1080
// }

let defaultExtraPointPackages: PointsPackageItem[] = [
  {
    points: 1000,
    month: 1,
    price: 15,
    activityBonusPoints: 0
  },
  {
    points: 3000,
    month: 1,
    price: 40,
    activityBonusPoints: 0
  },
  {
    points: 10000,
    month: 1,
    price: 120,
    activityBonusPoints: 0
  }
];

export const ModelSettings = () => {
  const [rawData, setRawData] = useState<ConfigFormType>();

  const { setValue, reset, watch, register, handleSubmit } =
    useForm<ConfigFormType['paySettings']>();

  const standard = watch(`subPlans.standard`);
  const extraPointsPackages = watch(`subPlans.extraPointsPackages`) || [];

  const [openPlan, setOpenPlan] = useState<boolean>(false);

  const { loading: loadingConfig } = useRequest(getInitFormData, {
    onSuccess: (data: ConfigStoreType) => {
      const aggregatedConfigs: ConfigFormType = formatConfigStore2FormSchema(data);
      setRawData(aggregatedConfigs);

      // 初始化默认值
      aggregatedConfigs.paySettings.subPlans.standard = aggregatedConfigs.paySettings.subPlans
        .standard
        ? {
            ...defaultStandardValueJSON,
            ...aggregatedConfigs.paySettings.subPlans.standard
          }
        : undefined;
      aggregatedConfigs.paySettings.subPlans.extraPointsPackages =
        aggregatedConfigs.paySettings.subPlans.extraPointsPackages ?? defaultExtraPointPackages;

      reset(aggregatedConfigs.paySettings);

      if (
        aggregatedConfigs.paySettings.subPlans &&
        aggregatedConfigs.paySettings.subPlans.standard &&
        Object.keys(aggregatedConfigs.paySettings.subPlans.standard).length > 0
      ) {
        setOpenPlan(true);
      } else {
        setOpenPlan(false);
      }
    },
    errorToast: '获取配置出错',
    manual: false
  });

  const { loading: loadingSave, runAsync: saveConfig } = useRequest(postUpdateConfig, {
    manual: true,
    successToast: '保存成功',
    errorToast: '保存失败'
  });

  const onSubmit = handleSubmit((data) => {
    if (!rawData) {
      return;
    }
    saveConfig(
      formatFormData2ConfigStore({
        ...rawData,
        paySettings: data
      })
    );
  });
  const isLoading = loadingConfig || loadingSave;

  // 检查是否有任何旧版套餐数据
  const hasLegacyPlans = useMemo(() => {
    return (
      standard &&
      !!(
        standard[StandardSubLevelEnum.experience] ||
        standard[StandardSubLevelEnum.team] ||
        standard[StandardSubLevelEnum.enterprise]
      )
    );
  }, [standard]);

  const titles: Array<titleType> = useMemo(
    () => [
      {
        mainTitle: '订阅套餐',
        subTitles: [
          ...(openPlan ? ['标准订阅套餐'] : []),
          ...(openPlan && hasLegacyPlans ? ['标准订阅套餐（旧版）'] : []),
          ...(openPlan ? ['知识库存储费用（xx元/1000条/月）'] : []),
          ...(openPlan ? ['额外AI积分费用'] : []),
          ...(openPlan ? ['自定义套餐说明'] : []),
          ...(openPlan ? ['应用备案地址'] : []),
          ...(openPlan ? ['社区支持提示'] : []),
          ...(openPlan ? ['活动到期时间'] : [])
        ]
      },
      {
        mainTitle: '支付方式',
        subTitles: ['微信支付配置', '支付宝支付配置', '对公支付消息提示']
      }
    ],
    [hasLegacyPlans, openPlan]
  );

  return (
    <SettingPage titles={titles} loading={isLoading} onSubmit={onSubmit}>
      <FirstTitle title="订阅套餐" />
      <Box px={6} pt={5} pb={openPlan ? 0 : 5}>
        <HStack>
          <Box>是否启用订阅套餐</Box>
          <Switch
            isChecked={openPlan}
            onChange={(e) => {
              const val = e.target.checked;
              if (val) {
                setValue('subPlans.standard', defaultStandardValueJSON);
                setValue('subPlans.extraPointsPackages', defaultExtraPointPackages);
                setOpenPlan(true);
              } else {
                if (standard) {
                  defaultStandardValueJSON = standard;
                }
                if (extraPointsPackages) {
                  defaultExtraPointPackages = extraPointsPackages;
                }

                setValue('subPlans.standard', undefined);
                setValue('subPlans.extraPointsPackages', []);
                setOpenPlan(false);
              }
            }}
          />
        </HStack>
      </Box>
      {openPlan && standard && (
        <>
          <Box
            key={'标准订阅套餐'}
            px={6}
            py={6}
            mb={4}
            _notLast={{
              borderBottomWidth: '1.5px',
              borderBottomColor: 'myGray.200'
            }}
          >
            <Flex pl={2} flexWrap={'wrap'}>
              <Box w="100%" _notFirst={{ mt: 5 }}>
                <FormLabel
                  title="标准订阅套餐"
                  description="包含 Free、Basic、Advanced、Custom 四个等级"
                  mb={2}
                />
                <StandardPlans
                  value={standard}
                  onChange={(val) => {
                    setValue(`subPlans.standard`, val);
                  }}
                />
              </Box>
            </Flex>
          </Box>
          {hasLegacyPlans && (
            <Box
              key={'标准订阅套餐（旧版）'}
              px={6}
              py={6}
              mb={4}
              _notLast={{
                borderBottomWidth: '1.5px',
                borderBottomColor: 'myGray.200'
              }}
            >
              <Flex pl={2} flexWrap={'wrap'}>
                <Box w="100%" _notFirst={{ mt: 5 }}>
                  <FormLabel
                    title="标准订阅套餐（旧版）"
                    description="包含 Experience、Team、Enterprise 三个等级"
                    mb={2}
                  />
                  <LegacyPlans
                    value={standard}
                    onChange={(val) => {
                      setValue(`subPlans.standard`, val);
                    }}
                  />
                </Box>
              </Flex>
            </Box>
          )}

          <FormItem title="知识库存储费用（xx元/1000条/月）">
            <Input {...register('subPlans.extraDatasetSizePrice')} />
          </FormItem>
          <FormItem>
            <ExtraPointsPackages
              value={extraPointsPackages}
              onChange={(val) => {
                setValue(`subPlans.extraPointsPackages`, val);
              }}
            />
          </FormItem>

          <FormItem
            title="自定义套餐说明"
            description="如果填写了该地址，会覆盖系统上套餐页面，会跳转到这个自定义页面，你可以在自定义页面里定义收费规则"
          >
            <Input
              {...register('subPlans.planDescriptionUrl')}
              placeholder="如果填写了该地址，会覆盖系统上套餐页面，会跳转到这个自定义页面，你可以在自定义页面里定义收费规则"
            />
          </FormItem>
          <FormItem
            title="应用备案地址"
            description="申请应用备案的跳转地址，用于引导用户进行应用备案申请"
          >
            <Input
              {...register('subPlans.appRegistrationUrl')}
              placeholder="申请应用备案的跳转地址"
            />
          </FormItem>
          <FormItem
            title="社区支持提示"
            description="当套餐不包含工单支持时，显示的社区支持提示信息，支持 Markdown 格式"
          >
            <Textarea
              {...register('subPlans.communitySupportTip')}
              variant="outline"
              rows={8}
              whiteSpace="pre-wrap"
              wordBreak={'break-word'}
              placeholder="输入社区支持提示内容，支持 Markdown 格式。例如：欢迎加入我们的社区获取支持"
            />
          </FormItem>
          <FormItem title="活动到期时间">
            <Flex gap={2} alignItems="center">
              <Input
                type="datetime-local"
                {...register('subPlans.activityExpirationTime')}
                variant="outline"
              />
              <Button
                size="sm"
                variant="grayOutline"
                onClick={() => {
                  setValue('subPlans.activityExpirationTime', undefined);
                }}
              >
                清除
              </Button>
            </Flex>
          </FormItem>
        </>
      )}

      <FirstTitle title="支付方式" />
      <SecondTitle title="微信支付配置" />
      <FormItem
        title="appid"
        description="微信支付相关材料\nhttps://pay.weixin.qq.com/index.php/core/home/login?return_url=https%3A%2F%2Fpay.weixin.qq.com%2Findex.php%2Fextend%2Femployee\n自行注册微信支付，目前需要wx扫码支付\nappid: ![](/config/appid.png)"
      >
        <Input
          {...register('wx.WX_APPID')}
          placeholder="微信支付相关材料\nhttps://pay.weixin.qq.com/index.php/core/home/login?return_url=https%3A%2F%2Fpay.weixin.qq.com%2Findex.php%2Fextend%2Femployee\n自行注册微信支付，目前需要wx扫码支付\nappid: ![](/config/appid.png)"
        />
      </FormItem>
      <FormItem title="Merchant ID" description="![](/config/wx_mchid.png)">
        <Input {...register('wx.WX_MCHID')} placeholder="![](/config/wx_mchid.png)" />
      </FormItem>

      <FormItem title="V3 Code" description="![](/config/ws_v3_code.png)">
        <Input {...register('wx.WX_V3_CODE')} placeholder="![](/config/ws_v3_code.png)" />
      </FormItem>

      <FormItem title="Notify URL" description="没用到，随便填个">
        <Input {...register('wx.WX_NOTIFY_URL')} placeholder="没用到，随便填个" />
      </FormItem>

      <FormItem
        title="Serial Number"
        description="点管理证书进去看到\n![](/config/wx_serial_no.png)"
      >
        <Input
          {...register('wx.WX_SERIAL_NO')}
          placeholder="点管理证书进去看到\n![](/config/wx_serial_no.png)"
        />
      </FormItem>

      <FormItem
        title="Private Key"
        description="按微信教程拿到这几个文件，txt打开key\n![](/config/wx_private_key.png)"
      >
        <Textarea
          {...register('wx.WX_PRIVATE_KEY')}
          variant="outline"
          rows={8}
          whiteSpace="pre-wrap"
          wordBreak={'break-word'}
          placeholder="按微信教程拿到这几个文件，txt打开key\n![](/config/wx_private_key.png)"
        />
      </FormItem>
      <SecondTitle title="支付宝支付配置" />
      <FormItem
        title="appid"
        description="支付宝支付相关材料\nhttps://open.alipay.com/develop/manage\n自行注册支付宝应用，目前需要开通电脑网站支付"
      >
        <Input
          {...register('alipay.APP_ID')}
          placeholder="支付宝支付相关材料\nhttps://open.alipay.com/develop/manage\n自行注册支付宝应用，目前需要开通电脑网站支付"
        />
      </FormItem>
      <FormItem
        title="Private Key"
        description="点接口加签方式后选择证书加密方式，具体操作参考\nhttps://opendocs.alipay.com/common/056zub?pathHash=91c49771\n"
      >
        <Textarea
          {...register('alipay.APP_PRIVATE_KEY')}
          variant="outline"
          rows={8}
          whiteSpace="pre-wrap"
          wordBreak={'break-word'}
          placeholder="点接口加签方式后选择证书加密方式，具体操作参考\nhttps://opendocs.alipay.com/common/056zub?pathHash=91c49771\n"
        />
      </FormItem>
      <FormItem title="应用公钥证书" description="参考上面私钥获取文档">
        <Textarea
          {...register('alipay.APP_CERT_CONTENT')}
          variant="outline"
          rows={8}
          whiteSpace="pre-wrap"
          wordBreak={'break-word'}
          placeholder="参考上面私钥获取文档"
        />
      </FormItem>
      <FormItem title="支付宝根证书" description="参考上面私钥获取文档">
        <Textarea
          {...register('alipay.ALIPAY_ROOT_CERT_CONTENT')}
          variant="outline"
          rows={8}
          whiteSpace="pre-wrap"
          wordBreak={'break-word'}
          placeholder="参考上面私钥获取文档"
        />
      </FormItem>
      <FormItem title="支付宝公钥证书" description="参考上面私钥获取文档">
        <Textarea
          {...register('alipay.ALIPAY_PUBLIC_CERT_CONTENT')}
          variant="outline"
          rows={8}
          whiteSpace="pre-wrap"
          wordBreak={'break-word'}
          placeholder="参考上面私钥获取文档"
        />
      </FormItem>
      <FormItem
        title="支付宝网关"
        description="支付宝网关，注意测试使用的沙箱环境是\nhttps://openapi-sandbox.dl.alipaydev.com/gateway.do\n，而生成环境是\nhttps://openapi.alipay.com/gateway.do\n"
      >
        <Input
          {...register('alipay.ALIPAY_GATEWAY')}
          placeholder="支付宝网关，注意测试使用的沙箱环境是\nhttps://openapi-sandbox.dl.alipaydev.com/gateway.do\n，而生成环境是\nhttps://openapi.alipay.com/gateway.do\n"
        />
      </FormItem>
      <FormItem
        title="Endpoint"
        description="支付宝端点，注意测试使用的沙箱环境是\nhttps://openapi-sandbox.dl.alipaydev.com\n，而生成环境是\nhttps://openapi.alipay.com\n"
      >
        <Input
          {...register('alipay.ALIPAY_ENDPOINT')}
          placeholder="支付宝端点，注意测试使用的沙箱环境是\nhttps://openapi-sandbox.dl.alipaydev.com\n，而生成环境是\nhttps://openapi.alipay.com\n"
        />
      </FormItem>
      <FormItem title="Notify URL" description="没用到，随便填个">
        <Input {...register('alipay.ALIPAY_NOTIFY_URL')} placeholder="没用到，随便填个" />
      </FormItem>
      <SecondTitle title="对公支付消息提示" />
      <FormItem title="消息提示" description="支持markdown格式">
        <Textarea
          {...register('bank.description')}
          variant="outline"
          rows={8}
          whiteSpace="pre-wrap"
          wordBreak={'break-word'}
        />
      </FormItem>
    </SettingPage>
  );
};

export default ModelSettings;

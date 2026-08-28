'use client';
import React, { useState } from 'react';
import { Box, Flex, Grid, Input, Textarea } from '@chakra-ui/react';
import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import { getInitFormData, postUpdateConfig } from '@/web/admin/config/api';
import FormLabel from './components/FormLabel';
import Switch from '@/pageComponents/admin/settings/Switch';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FirstTitle from '@/pageComponents/admin/settings/FirstTitle';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import SecondTitle from '@/pageComponents/admin/settings/SecondTitle';
import FormItem from '@/pageComponents/admin/settings/FormItem';
interface titleType {
  mainTitle: string;
  subTitles: string[];
}

export const Settings = () => {
  const [rawData, setRawData] = useState<any>({});
  const { reset, register, handleSubmit, control, watch } =
    useForm<ConfigFormType['siteSettings']>();

  const customDomainEnable = watch('feConfigs.customDomain.enable');

  const { loading: loadingConfig } = useRequest(getInitFormData, {
    onSuccess: (data: ConfigStoreType) => {
      const aggregatedConfigs: ConfigFormType = formatConfigStore2FormSchema(data);
      setRawData(aggregatedConfigs);
      reset(aggregatedConfigs.siteSettings);
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
        siteSettings: data
      })
    );
  });

  const isLoading = loadingConfig || loadingSave;

  const titles: Array<titleType> = [
    {
      mainTitle: '功能清单',
      subTitles: ['功能展示配置', '第三方知识库', '第三方发布渠道', '插件系统']
    },
    {
      mainTitle: '自定义域名',
      subTitles: []
    }
  ];

  return (
    <SettingPage titles={titles} loading={isLoading} onSubmit={onSubmit}>
      <FirstTitle title="功能清单" />

      <>
        <SecondTitle title="功能展示配置" />
        <Grid gridTemplateColumns={['1fr', '1fr 1fr']} px={[6, 8]}>
          <Flex alignItems={'center'} my={3}>
            <FormLabel title="展示聊天空白页（都关闭即可）" description="" minW={'240px'} />
            <Switch control={control} name="feConfigs.show_emptyChat" />
          </Flex>
          <Flex alignItems={'center'} my={3}>
            <FormLabel title="前端是否展示合规提示文案" description="" minW={'240px'} />
            <Switch control={control} name="feConfigs.show_compliance_copywriting" />
          </Flex>
        </Grid>
      </>

      <>
        <SecondTitle title="第三方知识库" />
        <Grid gridTemplateColumns={['1fr', '1fr 1fr']} px={[6, 8]}>
          <Flex alignItems={'center'} my={3}>
            <FormLabel
              title="飞书知识库"
              description="![](/config/show_dataset_feishu.png)\n关闭后，创建数据库时不再显示飞书数据库"
              minW={'240px'}
            />
            <Switch control={control} name="feConfigs.show_dataset_feishu" />
          </Flex>
          <Flex alignItems={'center'} my={3}>
            <FormLabel
              title="语雀知识库"
              description="![](/config/show_dataset_yuque.png)\n关闭后，创建数据库时不再显示语雀数据库"
              minW={'240px'}
            />
            <Switch control={control} name="feConfigs.show_dataset_yuque" />
          </Flex>
        </Grid>
      </>

      <>
        <SecondTitle title="第三方发布渠道" />
        <Grid gridTemplateColumns={['1fr', '1fr 1fr']} px={[6, 8]}>
          <Flex alignItems={'center'} my={3}>
            <FormLabel
              title="飞书发布渠道"
              description="![](/config/show_publish_feishu.png)\n关闭后，发布渠道中不再显示飞书发布渠道"
              minW={'240px'}
            />
            <Switch control={control} name="feConfigs.show_publish_feishu" />
          </Flex>
          <Flex alignItems={'center'} my={3}>
            <FormLabel
              title="钉钉发布渠道"
              description="![](/config/show_publish_dingtalk.png)\n关闭后，发布渠道中不再显示钉钉发布渠道"
              minW={'240px'}
            />
            <Switch control={control} name="feConfigs.show_publish_dingtalk" />
          </Flex>
          <Flex alignItems={'center'} my={3}>
            <FormLabel
              title="公众号发布渠道"
              description="![](/config/show_publish_offiaccount.png)\n关闭后，发布渠道中不再显示公众号发布渠道"
              minW={'240px'}
            />
            <Switch control={control} name="feConfigs.show_publish_offiaccount" />
          </Flex>
          <Flex alignItems={'center'} my={3}>
            <FormLabel
              title="企业微信发布渠道"
              description="![](/config/show_publish_wecom.png)\n关闭后，发布渠道中不再显示企业微信发布渠道"
              minW={'240px'}
            />
            <Switch control={control} name="feConfigs.show_publish_wecom" />
          </Flex>
          <Flex alignItems={'center'} my={3}>
            <FormLabel
              title="微信个人号发布渠道"
              description="关闭后，发布渠道中不再显示微信个人号发布渠道"
              minW={'240px'}
            />
            <Switch control={control} name="feConfigs.show_publish_wechat" />
          </Flex>
        </Grid>
      </>

      <>
        <SecondTitle title="插件系统" />
        <Grid gridTemplateColumns={['1fr', '1fr 1fr']} px={[6, 8]}>
          <Flex alignItems={'center'} my={3}>
            <FormLabel
              title="允许团队上传插件"
              description={
                '开启后，团队管理员可自行上传插件，并在团队内使用。\n关闭后，插件仅由系统管理员统一新增、管理。'
              }
              minW={'240px'}
            />
            <Switch control={control} name="feConfigs.enable_team_plugin_upload" />
          </Flex>
        </Grid>
      </>

      <>
        <FirstTitle title="自定义域名" />
        <Box py={3}>
          <Box px={6} mb="4">
            Saas 服务才会用到，借助 Sealos 能力，允许用户配置自定义域名。
          </Box>
          <Flex>
            <Box px={6}>是否使用自定义域名</Box>
            <Switch control={control} name="feConfigs.customDomain.enable" />
          </Flex>
        </Box>

        {customDomainEnable && (
          <>
            <>
              <SecondTitle title="阿里云" />
              <FormItem title="kubeconfig">
                <Textarea {...register('systemEnv.customDomain.kc.aliyun')} />
              </FormItem>
              <FormItem title="domain">
                <Input {...register('feConfigs.customDomain.domain.aliyun')} />
              </FormItem>
              <FormItem title="Issuer service name">
                <Input {...register('systemEnv.customDomain.issuerServiceName.aliyun')} />
              </FormItem>
              <FormItem title="Nginx service name">
                <Input {...register('systemEnv.customDomain.nginxServiceName.aliyun')} />
              </FormItem>
            </>

            <>
              <SecondTitle title="腾讯云" />
              <FormItem title="kubeconfig">
                <Textarea {...register('systemEnv.customDomain.kc.tencent')} />
              </FormItem>
              <FormItem title="domain">
                <Input {...register('feConfigs.customDomain.domain.tencent')} />
              </FormItem>
              <FormItem title="Issuer service name">
                <Input {...register('systemEnv.customDomain.issuerServiceName.tencent')} />
              </FormItem>
              <FormItem title="Nginx service name">
                <Input {...register('systemEnv.customDomain.nginxServiceName.tencent')} />
              </FormItem>
            </>

            <>
              <SecondTitle title="火山引擎" />
              <FormItem title="kubeconfig">
                <Textarea {...register('systemEnv.customDomain.kc.volcengine')} />
              </FormItem>
              <FormItem title="domain">
                <Input {...register('feConfigs.customDomain.domain.volcengine')} />
              </FormItem>
              <FormItem title="Issuer service name">
                <Input {...register('systemEnv.customDomain.issuerServiceName.volcengine')} />
              </FormItem>
              <FormItem title="Nginx service name">
                <Input {...register('systemEnv.customDomain.nginxServiceName.volcengine')} />
              </FormItem>
            </>
          </>
        )}
      </>

      {/* <>
        <FirstTitle title="服务 Ip 地址列表" />
        <FormItem>
          <Textarea
            {...register('feConfigs.ip_whitelist')}
            placeholder="123.345.567.789\n234.345.456.678;"
          />
        </FormItem>
      </> */}
    </SettingPage>
  );
};

export default Settings;

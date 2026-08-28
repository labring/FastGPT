'use client';
import React, { useState } from 'react';
import { Box, Input, Textarea, Divider } from '@chakra-ui/react';

import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import { getInitFormData, postUpdateConfig } from '@/web/admin/config/api';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FirstTitle from '@/pageComponents/admin/settings/FirstTitle';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import FormItem from '@/pageComponents/admin/settings/FormItem';
import Switch from '@/pageComponents/admin/settings/Switch';

interface titleType {
  mainTitle: string;
  subTitles: string[];
}

export const ModelSettings = () => {
  const [rawData, setRawData] = useState<ConfigFormType>();

  const { reset, register, handleSubmit, control } = useForm<{
    censor: ConfigFormType['securitySettings']['censor'];
    fileUrlWhitelist: string;
    workflowHttpNode: ConfigFormType['siteSettings']['systemEnv']['workflowHttpNode'];
  }>();

  const { loading: loadingConfig } = useRequest(getInitFormData, {
    onSuccess: (data: ConfigStoreType) => {
      const aggregatedConfigs: ConfigFormType = formatConfigStore2FormSchema(data);
      setRawData(aggregatedConfigs);
      reset({
        censor: aggregatedConfigs.securitySettings.censor,
        fileUrlWhitelist:
          aggregatedConfigs.siteSettings.systemEnv.fileUrlWhitelist?.join('\n') || '',
        workflowHttpNode: aggregatedConfigs.siteSettings.systemEnv.workflowHttpNode
      });
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
        securitySettings: {
          censor: data.censor
        },
        securitySystemEnvUpdates: {
          fileUrlWhitelist: data.fileUrlWhitelist
            ? data.fileUrlWhitelist
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
            : [],
          workflowHttpNode: data.workflowHttpNode
        }
      })
    );
  });

  const isLoading = loadingConfig || loadingSave;
  const titles: Array<titleType> = [
    {
      mainTitle: '基础配置',
      subTitles: ['HTTP 节点忽略 HTTPS 证书校验']
    },
    {
      mainTitle: '模型敏感审查',
      subTitles: ['百度敏感校验', '自定义安全校验 URL']
    },
    {
      mainTitle: '域名安全',
      subTitles: ['对话文件URL白名单']
    }
  ];
  return (
    <SettingPage titles={titles} loading={isLoading} onSubmit={onSubmit}>
      <FirstTitle title="基础配置" />
      <Box mt={4}></Box>
      <FormItem
        title="HTTP 节点忽略 HTTPS 证书校验"
        description="开启后，所有工作流 HTTP 请求节点在请求 HTTPS 地址时将跳过证书校验。仅建议在内网自签证书或测试环境使用。不会影响 HTTP 工具集、模型请求或其他系统出站请求。"
      >
        <Switch control={control} name="workflowHttpNode.ignoreHttpsCertificate" />
      </FormItem>
      <FirstTitle title="模型安全审查" />
      <Box mt={4}></Box>
      <FormItem
        title="百度安全 id"
        description="![](/config/baidu_censor.png)\nhttps://console.bce.baidu.com/ai/?_=1693133074333#/ai/antiporn/overview/index 注册百度安全校验账号，并创建对应应用。提供应用的 id 和 secret"
      >
        <Input
          {...register('censor.BAIDU_TEXT_CENSOR_CLIENTID')}
          placeholder="![](/config/baidu_censor.png)\nhttps://console.bce.baidu.com/ai/?_=1693133074333#/ai/antiporn/overview/index 注册百度安全校验账号，并创建对应应用。提供应用的 id 和 secret"
        />
      </FormItem>
      <FormItem title="百度安全 secret" description="">
        <Input {...register('censor.BAIDU_TEXT_CENSOR_CLIENTSECRET')} placeholder="" />
      </FormItem>
      <Divider my="4" />
      <FormItem
        title="自定义安全校验 URL"
        description="如果您有自己的安全校验服务，可以填写该地址，并在安全设置中开启自定义安全校验"
      >
        <Input
          {...register('censor.customCensorURL')}
          placeholder="如果您有自己的安全校验服务，可以填写该地址，并在安全设置中开启自定义安全校验"
        />
      </FormItem>
      <FirstTitle title="接口安全审查" />
      <Box mt={4}></Box>
      <FormItem
        title="文件URL白名单"
        description={`未配置，则认为全部链接可用。已配置，则认为白名单内的链接可用。暂时仅对对话接口生效，每行填写一个。例如: 
fastgpt.cn
cloud.fastgpt.cn
cloud.sealos.io`}
      >
        <Textarea
          {...register('fileUrlWhitelist')}
          placeholder={`未配置，则认为全部链接可用。已配置，则认为白名单内的链接可用。暂时仅对对话接口生效，每行填写一个。例如: 
fastgpt.cn
cloud.fastgpt.cn
cloud.sealos.io`}
          rows={8}
          variant="outline"
          whiteSpace="pre-wrap"
          wordBreak={'break-word'}
        />
      </FormItem>
    </SettingPage>
  );
};

export default ModelSettings;

'use client';
import React, { useState } from 'react';
import { Box, Flex } from '@chakra-ui/react';
import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import { getInitFormData, postUpdateConfig } from '@/web/admin/config/api';
import { useForm, useWatch } from 'react-hook-form';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import FormItem from '@/pageComponents/admin/settings/FormItem';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import ThirdPartyVariables from './components/FormField/ThirdPartyVariables';
import MyIcon from '@fastgpt/web/components/common/Icon';
interface titleType {
  mainTitle: string;
  subTitles: string[];
}

export const Settings = () => {
  const [rawData, setRawData] = useState<ConfigFormType>();

  const { setValue, reset, handleSubmit, control } = useForm<ConfigFormType>();
  const externalProviderWorkflowVariables = useWatch({
    control,
    name: 'externalProviderSettings.externalProviderWorkflowVariables'
  });

  const { loading: loadingConfig } = useRequest(getInitFormData, {
    onSuccess: (data: ConfigStoreType) => {
      const aggregatedConfigs = formatConfigStore2FormSchema(data);
      setRawData(aggregatedConfigs);

      reset({
        ...aggregatedConfigs,
        externalProviderSettings: {
          externalProviderWorkflowVariables:
            aggregatedConfigs.externalProviderSettings?.externalProviderWorkflowVariables || []
        }
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
        externalProviderSettings: {
          ...rawData.externalProviderSettings,
          externalProviderWorkflowVariables:
            data.externalProviderSettings.externalProviderWorkflowVariables
        }
      })
    );
  });

  const isLoading = loadingConfig || loadingSave;
  const titles: Array<titleType> = [
    {
      mainTitle: '自定义工作流变量',
      subTitles: []
    }
  ];

  return (
    <SettingPage titles={titles} loading={isLoading} onSubmit={onSubmit}>
      <FormItem full>
        <ThirdPartyVariables
          value={externalProviderWorkflowVariables}
          onChange={(val) => {
            setValue(`externalProviderSettings.externalProviderWorkflowVariables`, val);
          }}
          title="自定义工作流变量"
          titleExtra={
            <Flex
              color={'primary.600'}
              alignItems={'center'}
              cursor={'pointer'}
              onClick={() => {
                window.open(
                  'https://fael3z0zfze.feishu.cn/wiki/KOWaw6jkui5E3ekdOhvce4O9n4g?from=from_copylink'
                );
              }}
            >
              <MyIcon name="book" w={'14px'} mr={1} />
              <Box fontSize={'mini'} fontWeight={'medium'}>
                查看文档
              </Box>
            </Flex>
          }
        />
      </FormItem>
    </SettingPage>
  );
};

export default Settings;

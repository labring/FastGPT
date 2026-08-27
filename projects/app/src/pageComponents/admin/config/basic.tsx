'use client';
import React, { useState } from 'react';
import { Box, Input, Textarea } from '@chakra-ui/react';
import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import { getInitFormData, postUpdateConfig } from '@/web/admin/config/api';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FirstTitle from '@/pageComponents/admin/settings/FirstTitle';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import SecondTitle from '@/pageComponents/admin/settings/SecondTitle';
import FormItem from '@/pageComponents/admin/settings/FormItem';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import NavbarItems from './components/FormField/NavbarItems';
import ImageInput from '@/pageComponents/admin/settings/ImageInput';

interface titleType {
  mainTitle: string;
  subTitles: string[];
}

export const Settings = () => {
  const [rawData, setRawData] = useState<any>({});
  const { setValue, reset, watch, register, handleSubmit, control } =
    useForm<ConfigFormType['siteSettings']>();

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
      mainTitle: '基础配置',
      subTitles: [
        '前端展示配置',
        '个性化配置',
        '全局Script脚本',
        '系统参数',
        'PDF 解析配置',
        '使用限制',
        '小助手配置',
        '侧边栏配置'
      ]
    }
  ];

  return (
    <SettingPage titles={titles} loading={isLoading} onSubmit={onSubmit}>
      <FirstTitle title="基础配置" />
      <SecondTitle title="前端展示配置" />
      <FormItem title="系统名" description="">
        <Input {...register('feConfigs.systemTitle')} placeholder="" />
      </FormItem>
      <FormItem
        title="自定义api域名"
        description="可以设置一个额外的api地址，不使用主站的地址，需配置域名的cname和ssl证书。"
      >
        <Input
          {...register('feConfigs.customApiDomain')}
          placeholder="可以设置一个额外的api地址，不使用主站的地址，需配置域名的cname和ssl证书。"
        />
      </FormItem>
      <FormItem
        title="自定义分享链接域名"
        description="可以设置一个额外的分享链接地址，不使用主站的地址，需配置域名的cname和ssl证书。"
      >
        <Input
          {...register('feConfigs.customSharePageDomain')}
          placeholder="可以设置一个额外的分享链接地址，不使用主站的地址，需配置域名的cname和ssl证书。"
        />
      </FormItem>
      <FormItem title="favicon" description="">
        <ImageInput control={control} name="feConfigs.favicon" />
      </FormItem>
      <FormItem title="OpenAPI 前缀" description="">
        <Input {...register('systemEnv.openapiPrefix')} placeholder="" />
      </FormItem>

      <SecondTitle title="个性化配置" />

      <FormItem
        title="联系弹窗"
        description="使用 Markdown 进行配置，配置之后，在网页中“联系我们”相关的内容，会提示填写的内容。"
      >
        <Textarea
          rows={8}
          variant="outline"
          whiteSpace="pre-wrap"
          wordBreak={'break-word'}
          {...register('concatMd')}
          placeholder="使用 Markdown 进行配置，配置之后，在网页中“联系我们”相关的内容，会提示填写的内容。"
        />
      </FormItem>

      <FormItem title="自定义 api 文档地址" description="自定义 openapi 文档地址">
        <Input {...register('feConfigs.openAPIDocUrl')} placeholder="" />
      </FormItem>
      <FormItem title="使用文档地址（加一个 / 结尾，否则会携带子路径跳转）" description="">
        <Input {...register('feConfigs.docUrl')} placeholder="" />
      </FormItem>
      <FormItem
        title="登录引导文档地址"
        description="留空则前台登录页不显示“无法登录？”，填写后点击跳转到该地址"
      >
        <Input {...register('feConfigs.loginGuideDocUrl')} placeholder="" />
      </FormItem>
      <FormItem title="贡献模板市场文档地址" description="">
        <Input {...register('feConfigs.appTemplateCourse')} placeholder="" />
      </FormItem>

      <SecondTitle title="全局Script脚本" />

      <FormItem
        title="全局 Script 脚本"
        description="自定义 Script 脚本，可以全局插入（可以做站点流量监控之类的）"
      >
        <Box mb={8} w="100%">
          <JsonEditor
            value={watch('scripts')}
            onChange={(e) => {
              setValue('scripts', e || '');
            }}
            defaultHeight={250}
            resize
          />
        </Box>
      </FormItem>

      <SecondTitle title="系统参数" />
      <FormItem
        title="oneAPI地址(会覆盖环境变量配置的)"
        description="oneAPI地址，可以使用 oneapi 来实现多模型接入"
      >
        <Input {...register('systemEnv.oneapiUrl')} placeholder="请输入 oneAPI 地址" />
      </FormItem>
      <FormItem title="OneAPI 密钥(会覆盖环境变量配置的)" description="">
        <Input {...register('systemEnv.chatApiKey')} placeholder="请输入 OneAPI 密钥" />
      </FormItem>
      <FormItem title="知识库文件解析最大处理线程" description="">
        <Input
          type="number"
          {...register('systemEnv.datasetParseMaxProcess', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <FormItem title="知识库索引最大处理线程" description="">
        <Input
          type="number"
          {...register('systemEnv.vectorMaxProcess', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <FormItem title="文件理解模型最大处理线程" description="">
        <Input
          type="number"
          {...register('systemEnv.qaMaxProcess', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <FormItem title="图片理解模型最大处理线程" description="">
        <Input
          type="number"
          {...register('systemEnv.vlmMaxProcess', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <FormItem
        title="HNSW ef_search"
        description="HNSW 参数。越大召回率越高，性能越差，默认为 100，具体可见：https://github.com/pgvector/pgvector"
      >
        <Input
          type="number"
          {...register('systemEnv.hnswEfSearch', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <FormItem
        title="HNSW max_scan_tuples"
        description="迭代搜索最大数量，越大召回率越高，性能越差，默认为 100000，具体可见：https://github.com/pgvector/pgvector"
      >
        <Input
          type="number"
          {...register('systemEnv.hnswMaxScanTuples', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <SecondTitle title="PDF 解析配置" />
      <FormItem title="自定义 PDF 解析地址 (第一优先级)" description="">
        <Input {...register('systemEnv.customPdfParse.url')} placeholder="" />
      </FormItem>
      <FormItem title="自定义 PDF 解析密钥" description="">
        <Input {...register('systemEnv.customPdfParse.key')} placeholder="" />
      </FormItem>
      <FormItem
        title="SoMark PDF 解析密钥 (第二优先级)"
        description="在 https://somark.ai/Studio/apikey 创建 API Key"
      >
        <Input {...register('systemEnv.customPdfParse.somarkApiKey')} placeholder="" />
      </FormItem>
      <FormItem title="合合信息 Textin App ID (第三优先级)" description="">
        <Input {...register('systemEnv.customPdfParse.textinAppId')} placeholder="" />
      </FormItem>
      <FormItem title="合合信息 Textin Secret Code" description="">
        <Input {...register('systemEnv.customPdfParse.textinSecretCode')} placeholder="" />
      </FormItem>
      <FormItem title="Doc2x pdf 解析密钥 (第四优先级)" description="">
        <Input {...register('systemEnv.customPdfParse.doc2xKey')} placeholder="" />
      </FormItem>

      <FormItem title="自定义 PDF 解析价格(n 积分/页)" description="">
        <Input
          type="number"
          {...register('systemEnv.customPdfParse.price', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <SecondTitle title="使用限制" />
      <FormItem title="导出间隔时长(分钟)" description="">
        <Input
          type="number"
          {...register('limit.exportDatasetLimitMinutes', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <FormItem title="站点同步使用间隔时长(分钟)" description="">
        <Input
          type="number"
          {...register('limit.websiteSyncLimitMinuted', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <SecondTitle title="小助手配置" />
      <FormItem title="小助手 iframe 地址" description="">
        <Input {...register('feConfigs.botIframeUrl')} placeholder="" />
      </FormItem>
      <SecondTitle title="侧边栏配置" />
      <Box p={6}>
        <NavbarItems
          value={watch('navbar')}
          onChange={(e: any) => {
            setValue('navbar', e);
          }}
          title="侧边栏配置"
          description="移动端的侧边栏显示在账号 - 个人信息里"
        />
      </Box>
    </SettingPage>
  );
};

export default Settings;

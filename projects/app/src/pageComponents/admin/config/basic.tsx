'use client';
import React, { useState } from 'react';
import { Input, Textarea } from '@chakra-ui/react';
import { formatConfigStore2FormSchema, formatFormData2ConfigStore } from '@/web/admin/config/adapt';
import type { ConfigFormType, ConfigStoreType } from '@/pageComponents/admin/config/type';
import { getInitFormData, postUpdateConfig } from '@/web/admin/system/api';
import { useForm } from 'react-hook-form';
import { useRequest } from '@fastgpt/web/hooks/useRequest';
import FirstTitle from '@/pageComponents/admin/settings/FirstTitle';
import SettingPage from '@/pageComponents/admin/settings/SettingPage';
import FormItem from '@/pageComponents/admin/settings/FormItem';
import JsonEditor from '@fastgpt/web/components/common/Textarea/JsonEditor';
import { useConfirm } from '@fastgpt/web/hooks/useConfirm';
import NavbarItems from './components/FormField/NavbarItems';
import ImageInput from '@/pageComponents/admin/settings/ImageInput';

interface titleType {
  mainTitle: string;
  subTitles: string[];
}

export const Settings = () => {
  const [rawData, setRawData] = useState<ConfigFormType>();
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

  const submitConfig = (data: ConfigFormType['siteSettings']) => {
    if (!rawData) {
      return;
    }
    saveConfig(
      formatFormData2ConfigStore({
        ...rawData,
        siteSettings: data
      })
    );
  };

  const { ConfirmModal: ConfirmSandboxLimitModal, openConfirm: openSandboxLimitConfirm } =
    useConfirm();

  /**
   * 单团队沙箱配额大于系统总上限时，团队维度不会先触发（系统总上限会先拦截所有团队），
   * 属于典型的误配；保存前给出软性警告确认，不硬拦。
   */
  const onSubmit = handleSubmit((data) => {
    const systemLimit = data.limit?.agentSandboxMax;
    const teamLimit = data.limit?.agentSandboxMaxPerTeam;
    if (
      typeof systemLimit === 'number' &&
      Number.isFinite(systemLimit) &&
      systemLimit > 0 &&
      typeof teamLimit === 'number' &&
      Number.isFinite(teamLimit) &&
      teamLimit > systemLimit
    ) {
      openSandboxLimitConfirm({
        title: '单团队配额超过系统总上限',
        customContent: `单团队配额（${teamLimit}）大于系统总上限（${systemLimit}），超出部分不会生效（系统总上限会先拦截所有团队）。是否仍要保存？`,
        confirmText: '仍然保存',
        cancelText: '返回修改',
        onConfirm: () => submitConfig(data)
      })();
      return;
    }
    submitConfig(data);
  });
  const isLoading = loadingConfig || loadingSave;

  const titles: Array<titleType> = [
    '前端展示配置',
    '个性化配置',
    '全局Script脚本',
    '系统参数',
    'PDF 解析配置',
    '使用限制',
    '小助手配置',
    '侧边栏配置'
  ].map((mainTitle) => ({ mainTitle, subTitles: [] }));

  return (
    <SettingPage titles={titles} loading={isLoading} onSubmit={onSubmit}>
      <FirstTitle title="前端展示配置" />
      <FormItem title="系统名" description="">
        <Input {...register('feConfigs.systemTitle')} placeholder="" />
      </FormItem>
      <FormItem
        title="自定义api域名"
        description="可以设置一个额外的api地址，不使用主站的地址，需配置域名的cname和ssl证书。"
      >
        <Input {...register('feConfigs.customApiDomain')} placeholder="" />
      </FormItem>
      <FormItem
        title="自定义分享链接域名"
        description="可以设置一个额外的分享链接地址，不使用主站的地址，需配置域名的cname和ssl证书。"
      >
        <Input {...register('feConfigs.customSharePageDomain')} placeholder="" />
      </FormItem>
      <FormItem title="favicon" description="">
        <ImageInput control={control} name="feConfigs.favicon" />
      </FormItem>
      <FormItem title="OpenAPI 前缀" description="">
        <Input {...register('systemEnv.openapiPrefix')} placeholder="" />
      </FormItem>

      <FirstTitle title="个性化配置" />

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

      <FirstTitle title="全局Script脚本" />

      <FormItem
        title="全局 Script 脚本"
        description="自定义 Script 脚本，可以全局插入（可以做站点流量监控之类的）"
      >
        <JsonEditor
          value={watch('scripts')}
          onChange={(e) => {
            setValue('scripts', e || '');
          }}
          defaultHeight={250}
          resize
        />
      </FormItem>

      <FirstTitle title="系统参数" />
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
      <FirstTitle title="PDF 解析配置" />
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
      <FirstTitle title="使用限制" />
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
      <FormItem
        title="沙箱实例系统总上限"
        description="所有团队 Agent 沙箱活跃实例合计上限，留空表示使用环境变量配置；建议不低于单团队配额。"
      >
        <Input
          type="number"
          {...register('limit.agentSandboxMax', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <FormItem
        title="单团队沙箱实例配额"
        description="单团队 Agent 沙箱活跃实例上限，留空表示使用环境变量配置，环境变量未配置时不限制；建议不超过系统总上限，超过时超出部分不会生效。"
      >
        <Input
          type="number"
          {...register('limit.agentSandboxMaxPerTeam', {
            valueAsNumber: true
          })}
          placeholder=""
        />
      </FormItem>
      <FirstTitle title="小助手配置" />
      <FormItem title="小助手 iframe 地址" description="">
        <Input {...register('feConfigs.botIframeUrl')} placeholder="" />
      </FormItem>
      <FirstTitle title="侧边栏配置" />
      <FormItem full>
        <NavbarItems
          value={watch('navbar')}
          onChange={(e) => {
            setValue('navbar', e);
          }}
          title="侧边栏配置"
          description="移动端的侧边栏显示在账号 - 个人信息里"
        />
      </FormItem>
      <ConfirmSandboxLimitModal />
    </SettingPage>
  );
};

export default Settings;

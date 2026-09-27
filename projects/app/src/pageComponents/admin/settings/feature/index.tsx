import React, { useEffect } from 'react';
import { SimpleGrid } from '@chakra-ui/react';
import { useForm, Controller } from 'react-hook-form';
import MySelect from '@fastgpt/web/components/common/MySelect';
import { useDomainConfig } from '@/web/common/system/useDomainConfig';
import {
  AdminSettingPage,
  AdminSettingSection,
  AdminFormItem,
  AdminSwitchRow,
  type SettingTOCItem
} from '@/pageComponents/admin/settings';
import type { SystemInstanceConfigDomainMap } from '@fastgpt/global/common/system/config';

type FeatureConfigForm = SystemInstanceConfigDomainMap['feature'];

const tocItems: SettingTOCItem[] = [
  { id: 'chatAndDisplay', label: '对话与展示' },
  { id: 'teamAndPlugin', label: '团队与插件' },
  { id: 'runtimeCapability', label: '运行时能力' }
];

const FeatureSettingComponent = () => {
  const { effectiveConfig, isLoading, isUpdating, updateConfig } = useDomainConfig('feature');

  const { control, handleSubmit, reset } = useForm<FeatureConfigForm>({
    defaultValues: effectiveConfig
  });

  useEffect(() => {
    if (effectiveConfig && Object.keys(effectiveConfig).length > 0) {
      reset(effectiveConfig);
    }
  }, [effectiveConfig, reset]);

  const onSave = handleSubmit(async (formData) => {
    await updateConfig(formData);
  });

  return (
    <AdminSettingPage
      headerTitle={'功能开关'}
      tocItems={tocItems}
      isLoading={isLoading}
      isSaving={isUpdating}
      onSave={onSave}
    >
      {/* 1. 对话与展示 */}
      <AdminSettingSection id="chatAndDisplay" title="对话与展示">
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="hideChatCopyrightSetting"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="隐藏聊天版权设置"
                tooltip="开启后，分享页和嵌入式聊天窗口允许关闭或隐藏 FastGPT 版权声明标识"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="showEmptyChat"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="展示聊天空白页"
                tooltip="新对话未发送消息时展示功能介绍、空白页指引及推荐提示语"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="multipleDataToBase64"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="多媒体内容转 Base64"
                tooltip="开启后，图片等富媒体数据在流式传输与存储中转为 Base64 编码"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 2. 团队与插件 */}
      <AdminSettingSection id="teamAndPlugin" title="团队与插件" showDivider>
        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="enableTeamPluginUpload"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="允许团队上传插件"
                tooltip="允许普通团队成员直接上传自定义插件安装包并在团队内使用"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="showGit"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="展示 Git 仓库入口"
                tooltip="在前端导航或关于弹窗中展示官方 GitHub 开源项目入口及 Star 链接"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>

      {/* 3. 运行时能力 */}
      <AdminSettingSection id="runtimeCapability" title="运行时能力" showDivider>
        <AdminFormItem
          label="Agent 执行引擎"
          tooltip="fastAgent：单节点轻量级高并发引擎；piAgent：支持多步骤推演及工具规划引擎"
          isRequired
          mb={6}
        >
          <Controller
            name="agentEngine"
            control={control}
            render={({ field }) => (
              <MySelect<string>
                width={'400px'}
                list={[
                  { label: 'fastAgent (高性能单节点流式引擎)', value: 'fastAgent' },
                  { label: 'piAgent (多步推演与工具决策引擎)', value: 'piAgent' }
                ]}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </AdminFormItem>

        <SimpleGrid columns={[1, 2]} spacingX={16} spacingY={4}>
          <Controller
            name="datasetSynonymEnabled"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="知识库同义词扩展"
                tooltip="在知识库检索环节自动结合同义词库进行语义扩展匹配"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />

          <Controller
            name="disableCache"
            control={control}
            render={({ field }) => (
              <AdminSwitchRow
                label="关闭运行时缓存"
                tooltip="关闭流程编排和模型推理调用的内存热缓存（修改后需重启或重建缓存生效）"
                isChecked={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </SimpleGrid>
      </AdminSettingSection>
    </AdminSettingPage>
  );
};

export default React.memo(FeatureSettingComponent);

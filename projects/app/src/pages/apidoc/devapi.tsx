import { ScalarOpenApiPage } from '@/pageComponents/apidoc/ScalarOpenApiPage';
import { DevApiTagNameAliases, DevApiTagsMap } from '@fastgpt/global/openapi/tag';
import { useSafeTranslation } from '@fastgpt/web/hooks/useSafeTranslation';

function DevApiDocPage() {
  const { t } = useSafeTranslation();

  return (
    <ScalarOpenApiPage
      documentUrl="/api/apidoc/devapi.json"
      flattenedTagNames={[DevApiTagsMap.aiAuxiliary, DevApiTagsMap.toolPreview]}
      nestedTagGroups={{
        管理员接口: [
          '数据面板',
          '用户管理',
          '系统资源',
          '用户资源',
          '系统配置',
          '支付管理',
          '通知管理',
          '审计日志',
          'License 管理'
        ],
        用户管理: ['用户信息', '团队', '套餐'],
        系统资源: [
          '系统模型',
          '模型渠道',
          '模型监控日志',
          '插件管理',
          '系统工具管理',
          '应用模板',
          '模板类型'
        ]
      }}
      tagNameAliases={{
        ...DevApiTagNameAliases,
        [DevApiTagsMap.commonOther]: t('common:Other')
      }}
    />
  );
}

export default DevApiDocPage;

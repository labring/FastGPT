import { PluginSourceEnum } from '@fastgpt/global/core/plugin/constants';
import { FlowNodeTemplateTypeEnum } from '@fastgpt/global/core/workflow/constants';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { SystemPluginResponseType } from './type';
import { NodeTemplateListItemType } from '@fastgpt/global/core/workflow/type/node';
import { isProduction } from '../service/common/system/constants';

let list = ['getTime', 'fetchUrl', 'mathExprVal'];

export const getCommunityPlugins = () => {
  if (isProduction && global.communitySystemPlugins) return global.communitySystemPlugins;

  global.communitySystemPlugins = list.map((name) => ({
    ...require(`./src/${name}/template.json`),
    id: `${PluginSourceEnum.community}-${name}`
  }));

  return global.communitySystemPlugins;
};

export const getCommunityPluginsTemplateList = () => {
  return getCommunityPlugins().map<NodeTemplateListItemType>((plugin) => ({
    id: plugin.id,
    templateType: plugin.templateType ?? FlowNodeTemplateTypeEnum.other,
    flowNodeType: FlowNodeTypeEnum.pluginModule,
    avatar: plugin.avatar,
    name: plugin.name,
    intro: plugin.intro,
    isTool: plugin.isTool
  }));
};

export const getCommunityCb = async () => {
  if (isProduction && global.communitySystemPluginCb) return global.communitySystemPluginCb;

  // Do not modify the following code
  const loadModule = async (name: string) => {
    const module = await import(`./src/${name}/index`);
    return module.default;
  };

  const result = await Promise.all(
    list.map(async (name) => ({
      name,
      cb: await loadModule(name)
    }))
  );

  global.communitySystemPluginCb = result.reduce<
    Record<string, (e: any) => SystemPluginResponseType>
  >((acc, { name, cb }) => {
    acc[name] = cb;
    return acc;
  }, {});

  return global.communitySystemPluginCb;
};

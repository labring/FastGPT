import { PluginSourceEnum } from '../global/core/plugin/constants';

export const templateList = [
  'animalLife',
  'chatGuide',
  'Chinese',
  'CQ',
  'divination',
  'flux',
  'githubIssue',
  'google',
  'longTranslate',
  'plugin-dalle',
  'plugin-feishu',
  'simpleDatasetChat',
  'srt-translate',
  'stock',
  'timeBot',
  'TranslateRobot'
];

export const getCommunityTemplates = () => {
  const appMarketTemplates = templateList.map((name) => {
    const config = require(`./src/${name}/template.json`);
    return {
      ...config,
      templateId: `${PluginSourceEnum.community}-${name}`,
      isActive: true
    };
  });

  return appMarketTemplates.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
};

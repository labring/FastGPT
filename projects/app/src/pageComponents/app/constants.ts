import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';

export const appTypeMap = {
  [AppTypeEnum.simple]: {
    icon: 'core/app/simpleBot',
    title: i18nT('app:type.Create simple bot'),
    avatar: 'core/app/type/simpleFill',
    emptyCreateText: i18nT('app:create_empty_app')
  },
  [AppTypeEnum.workflow]: {
    icon: 'core/app/type/workflowFill',
    avatar: 'core/app/type/workflowFill',
    title: i18nT('app:type.Create workflow bot'),
    emptyCreateText: i18nT('app:create_empty_workflow')
  },
  [AppTypeEnum.plugin]: {
    icon: 'core/app/type/pluginFill',
    avatar: 'core/app/type/pluginFill',
    title: i18nT('app:type.Create plugin bot'),
    emptyCreateText: i18nT('app:create_empty_plugin')
  }
};

import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { i18nT } from '@fastgpt/web/i18n/utils';

export const appTypeTagMap = {
  [AppTypeEnum.simple]: {
    label: i18nT('app:type.Chat_Agent'),
    icon: 'core/app/type/simple'
  },
  [AppTypeEnum.workflow]: {
    label: i18nT('app:type.Workflow bot'),
    icon: 'core/app/type/workflow'
  },
  [AppTypeEnum.workflowTool]: {
    label: i18nT('app:toolType_workflow'),
    icon: 'core/app/type/plugin'
  },
  [AppTypeEnum.httpPlugin]: {
    label: i18nT('app:type.Http plugin'),
    icon: 'core/app/type/httpPlugin'
  },
  [AppTypeEnum.httpToolSet]: {
    label: i18nT('app:toolType_http'),
    icon: 'core/app/type/httpPlugin'
  },
  [AppTypeEnum.mcpToolSet]: {
    label: i18nT('app:toolType_mcp'),
    icon: 'core/app/type/mcpTools'
  },
  [AppTypeEnum.tool]: undefined,
  [AppTypeEnum.folder]: undefined,
  [AppTypeEnum.hidden]: undefined,
  [AppTypeEnum.agent]: undefined
};

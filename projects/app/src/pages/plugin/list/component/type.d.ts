import { CreateOnePluginParams } from '@fastgpt/global/core/plugin/controller';

export type EditFormType = CreateOnePluginParams & {
  id?: string;
};

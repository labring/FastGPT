import type { AppChatConfigType, AppFormEditFormType } from '@fastgpt/global/core/app/type';
import type { WorkflowType } from '../Agent/utils';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';

export type AppForm2WorkflowFnType = ({
  nodes,
  chatConfig
}: {
  nodes: StoreNodeItemType[];
  chatConfig: AppChatConfigType;
}) => AppFormEditFormType;

export type Form2WorkflowFnType = (
  data: AppFormEditFormType,
  t: any
) => WorkflowType & {
  chatConfig: AppChatConfigType;
};

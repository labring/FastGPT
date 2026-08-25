import type { AppChatConfigType } from '@fastgpt/global/core/app/type';
import type { AppFormEditFormType } from '@fastgpt/global/core/app/formEdit/type';
import type { WorkflowType } from '../ChatAgent/utils';
import type { StoreNodeItemType } from '@fastgpt/global/core/workflow/type/node';
import type { ModelListItem } from '@fastgpt/global/openapi/core/ai/model/api';

export type AppForm2WorkflowFnType = ({
  nodes,
  chatConfig
}: {
  nodes: StoreNodeItemType[];
  chatConfig: AppChatConfigType;
}) => AppFormEditFormType;

export type Form2WorkflowFnType = (
  data: AppFormEditFormType,
  t: any,
  /**
   * Lazily fetched llm list; used to derive the file-select capabilities from
   * the selected model when converting the form to a workflow.
   */
  llmList?: ModelListItem[]
) => WorkflowType & {
  chatConfig: AppChatConfigType;
};

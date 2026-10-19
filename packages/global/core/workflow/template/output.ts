import {
  FlowNodeOutputItemTypeSchema,
  type FlowNodeInputItemType,
  type FlowNodeOutputItemType
} from '../type/io';
import type { LLMModelDataType } from '../../ai/model/schema';
import z from 'zod';
import { BoolSchema } from '../../../common/zod';
import { NodeOutputKeyEnum } from '../constants';
import { FlowNodeOutputTypeEnum } from '../node/constant';
import { WorkflowIOValueTypeEnum } from '../constants';
import { i18nT } from '../../../common/i18n/utils';

/** 画布模板在通用输出数据上附加可用性计算；回调只供客户端使用，不参与持久化。 */
export const FlowNodeTemplateOutputItemTypeSchema = FlowNodeOutputItemTypeSchema.extend({
  invalidCondition: z
    .function({
      input: z.tuple([
        z.object({
          inputs: z.custom<FlowNodeInputItemType[]>(),
          llmModelMap:
            z.custom<Record<string, Pick<LLMModelDataType, 'model' | 'modelId' | 'config'>>>()
        })
      ]),
      output: BoolSchema
    })
    .optional()
});
export type FlowNodeTemplateOutputItemType = z.infer<typeof FlowNodeTemplateOutputItemTypeSchema>;

export const Output_Template_AddOutput: FlowNodeOutputItemType = {
  id: NodeOutputKeyEnum.addOutputParam,
  key: NodeOutputKeyEnum.addOutputParam,
  type: FlowNodeOutputTypeEnum.dynamic,
  valueType: WorkflowIOValueTypeEnum.dynamic,
  label: '',
  customFieldConfig: {
    selectValueTypeList: Object.values(WorkflowIOValueTypeEnum),
    showDescription: false,
    showDefaultValue: false
  }
};

export const Output_Template_Error_Message: FlowNodeOutputItemType = {
  id: NodeOutputKeyEnum.errorText,
  key: NodeOutputKeyEnum.errorText,
  type: FlowNodeOutputTypeEnum.error,
  valueType: WorkflowIOValueTypeEnum.string,
  label: i18nT('workflow:error_text')
};

export const userFilesInput: FlowNodeOutputItemType = {
  id: NodeOutputKeyEnum.userFiles,
  key: NodeOutputKeyEnum.userFiles,
  label: i18nT('app:workflow.user_file_input'),
  description: i18nT('app:workflow.user_file_input_desc'),
  type: FlowNodeOutputTypeEnum.static,
  valueType: WorkflowIOValueTypeEnum.arrayString
};

import { LLMModelItemSchema } from '../../ai/model';
import { LLMModelTypeEnum } from '../../ai/constants';
import { WorkflowIOValueTypeEnum, NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../node/constant';
import { SecretValueTypeSchema } from '../../../common/secret/type';
import z from 'zod';

/* Dataset node */
export const SelectedDatasetSchema = z.object({
  datasetId: z.string(),
  avatar: z.string(),
  name: z.string(),
  vectorModel: z.object({
    model: z.string()
  })
});
export type SelectedDatasetType = z.infer<typeof SelectedDatasetSchema>;

// Dynamic input field configuration
export const CustomFieldConfigTypeSchema = z.object({
  // reference
  selectValueTypeList: z.array(z.enum(WorkflowIOValueTypeEnum)).optional(), // 可以选哪个数据类型, 只有1个的话,则默认选择
  showDefaultValue: z.boolean().optional(),
  showDescription: z.boolean().optional()
});
export type CustomFieldConfigType = z.infer<typeof CustomFieldConfigTypeSchema>;

export const InputComponentPropsTypeSchema = z.object({
  key: z.enum(NodeInputKeyEnum).or(z.string()),
  label: z.string(),

  valueType: z.enum(WorkflowIOValueTypeEnum).optional(),
  required: z.boolean().optional(),
  defaultValue: z.any().optional(),

  // 不同组件的配置嘻嘻
  referencePlaceholder: z.string().optional(),
  isRichText: z.boolean().optional(), // Prompt editor
  placeholder: z.string().optional(), // input,textarea
  maxLength: z.number().optional(), // input,textarea
  minLength: z.number().optional(), // password
  list: z.array(z.object({ label: z.string(), value: z.string() })).optional(), // select
  markList: z.array(z.object({ label: z.string(), value: z.number() })).optional(), // slider
  step: z.number().optional(), // slider
  max: z.number().optional(), // slider, number input
  min: z.number().optional(), // slider, number input
  precision: z.number().optional(), // number input
  llmModelType: z.enum(LLMModelTypeEnum).optional(), // ai model select

  canSelectFile: z.boolean().optional(), // file select
  canSelectImg: z.boolean().optional(), // file select
  canSelectVideo: z.boolean().optional(), // file select
  canSelectAudio: z.boolean().optional(), // file select
  canSelectCustomFileExtension: z.boolean().optional(), // file select
  customFileExtensionList: z.array(z.string()).optional(), // file select
  canLocalUpload: z.boolean().optional(), // file select
  canUrlUpload: z.boolean().optional(), // file select
  maxFiles: z.number().optional(), // file select

  // Time
  timeGranularity: z.enum(['day', 'hour', 'minute', 'second']).optional(), // time point select, time range select
  timeRangeStart: z.string().optional(), // time range select
  timeRangeEnd: z.string().optional(), // time range select

  // dataset select
  datasetOptions: z.array(SelectedDatasetSchema).optional(),

  // dynamic input
  customInputConfig: CustomFieldConfigTypeSchema.optional(),

  // @deprecated
  enums: z.array(z.object({ value: z.string(), label: z.string() })).optional()
});
export type InputComponentPropsType = z.infer<typeof InputComponentPropsTypeSchema>;

// 输入配置
export const InputConfigTypeSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
  inputType: z.enum(['input', 'numberInput', 'secret', 'switch', 'select']),
  value: SecretValueTypeSchema.optional(),

  // Selector
  list: z.array(z.object({ label: z.string(), value: z.string() })).optional()
});
export type InputConfigType = z.infer<typeof InputConfigTypeSchema>;

// Workflow node input
export const FlowNodeInputItemTypeSchema = InputComponentPropsTypeSchema.extend({
  selectedTypeIndex: z.number().optional(),
  renderTypeList: z.array(z.enum(FlowNodeInputTypeEnum)), // Node Type. Decide on a render style
  valueDesc: z.string().optional(), // data desc
  value: z.any().optional(),

  debugLabel: z.string().optional(),

  description: z.string().optional(), // field desc
  toolDescription: z.string().optional(), // If this field is not empty, it is entered as a tool

  enum: z.string().optional(),
  inputList: z.array(InputConfigTypeSchema).optional(), // when key === 'system_input_config', this field is used

  // render components params
  canEdit: z.boolean().optional(), // dynamic inputs
  isPro: z.boolean().optional(), // Pro version field
  isToolOutput: z.boolean().optional(),

  deprecated: z.boolean().optional() // node deprecated
});
export type FlowNodeInputItemType = z.infer<typeof FlowNodeInputItemTypeSchema>;

// Workflow node output
export const FlowNodeOutputItemTypeSchema = z.object({
  id: z.string(),
  key: z.enum(NodeOutputKeyEnum).or(z.string()),
  type: z.enum(FlowNodeOutputTypeEnum),
  valueType: z.enum(WorkflowIOValueTypeEnum).optional(),
  valueDesc: z.string().optional(),
  value: z.any().optional(),

  label: z.string().optional(),
  description: z.string().optional(),
  defaultValue: z.any().optional(),
  required: z.boolean().optional(),

  invalid: z.boolean().optional(),
  invalidCondition: z.optional(
    z
      .function({
        input: z.tuple([
          z.object({
            inputs: FlowNodeInputItemTypeSchema.array(),
            llmModelList: LLMModelItemSchema.array()
          })
        ]),
        output: z.boolean()
      })
      .meta({
        override: {
          type: 'string',
          description: 'Function placeholder; not represented in JSON payloads'
        }
      })
  ),

  customFieldConfig: CustomFieldConfigTypeSchema.optional(),
  deprecated: z.boolean().optional()
});
export type FlowNodeOutputItemType = z.infer<typeof FlowNodeOutputItemTypeSchema>;

/* Reference */
export const ReferenceItemValueTypeSchema = z.tuple([z.string(), z.string().optional()]);
export type ReferenceItemValueType = z.infer<typeof ReferenceItemValueTypeSchema>;
export const ReferenceArrayValueTypeSchema = z.array(ReferenceItemValueTypeSchema);
export type ReferenceArrayValueType = z.infer<typeof ReferenceArrayValueTypeSchema>;
export const ReferenceValueTypeSchema = z.union([
  ReferenceItemValueTypeSchema,
  ReferenceArrayValueTypeSchema
]);
export type ReferenceValueType = z.infer<typeof ReferenceValueTypeSchema>;

/* http node */
export const HttpParamAndHeaderItemTypeSchema = z.object({
  key: z.string(),
  type: z.string(),
  value: z.string()
});
export type HttpParamAndHeaderItemType = z.infer<typeof HttpParamAndHeaderItemTypeSchema>;

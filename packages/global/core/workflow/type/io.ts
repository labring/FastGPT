import { LLMModelItemSchema } from '../../ai/model.schema';
import { WorkflowIOValueTypeEnum, NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../node/constant';
import { SecretValueTypeSchema } from '../../../common/secret/type';
import z from 'zod';
import { BoolSchema, IntSchema, NumSchema } from '../../../common/zod';

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
  showDefaultValue: BoolSchema.optional(),
  showDescription: BoolSchema.optional(),
  hideBottomDivider: BoolSchema.optional()
});
export type CustomFieldConfigType = z.infer<typeof CustomFieldConfigTypeSchema>;

export const InputComponentPropsTypeSchema = z.object({
  key: z.enum(NodeInputKeyEnum).or(z.string()),
  label: z.string(),

  valueType: z.enum(WorkflowIOValueTypeEnum).optional(),
  required: BoolSchema.optional(),
  defaultValue: z.any().optional(),

  // 不同组件的配置嘻嘻
  referencePlaceholder: z.string().optional(),
  isRichText: BoolSchema.optional(), // Prompt editor
  placeholder: z.string().optional(), // input,textarea
  maxLength: IntSchema.optional(), // input,textarea
  minLength: IntSchema.optional(), // password
  list: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
        icon: z.string().optional(),
        description: z.string().optional()
      })
    )
    .optional(), // select
  markList: z.array(z.object({ label: z.string(), value: NumSchema })).optional(), // slider
  step: NumSchema.optional(), // slider
  max: NumSchema.optional(), // slider, number input
  min: NumSchema.optional(), // slider, number input
  precision: NumSchema.optional(), // number input

  canSelectFile: BoolSchema.optional(), // file select
  canSelectImg: BoolSchema.optional(), // file select
  canSelectVideo: BoolSchema.optional(), // file select
  canSelectAudio: BoolSchema.optional(), // file select
  canSelectCustomFileExtension: BoolSchema.optional(), // file select
  customFileExtensionList: z.array(z.string()).optional(), // file select
  canLocalUpload: BoolSchema.optional(), // file select
  canUrlUpload: BoolSchema.optional(), // file select
  maxFiles: IntSchema.optional(), // file select

  // Time
  timeGranularity: z.enum(['day', 'hour', 'minute', 'second']).optional(), // time point select, time range select
  timeRangeStart: z.string().optional(), // time range select
  timeRangeEnd: z.string().optional(), // time range select

  // dataset select
  datasetOptions: z.array(SelectedDatasetSchema).optional(),

  // dynamic input
  customInputConfig: CustomFieldConfigTypeSchema.optional(),

  /** @deprecated */
  enums: z.array(z.object({ value: z.string(), label: z.string() })).optional()
});
export type InputComponentPropsType = z.infer<typeof InputComponentPropsTypeSchema>;

// 输入配置
export const InputConfigTypeSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string().optional(),
  required: BoolSchema.optional(),
  inputType: z.enum(['input', 'numberInput', 'secret', 'switch', 'select']),
  value: SecretValueTypeSchema.optional(),

  // Selector
  list: z.array(z.object({ label: z.string(), value: z.string() })).optional()
});
export type InputConfigType = z.infer<typeof InputConfigTypeSchema>;

// Workflow node input
export const FlowNodeInputItemTypeSchema = InputComponentPropsTypeSchema.extend({
  selectedTypeIndex: IntSchema.optional(),
  renderTypeList: z.array(z.enum(FlowNodeInputTypeEnum)), // Node Type. Decide on a render style
  valueDesc: z.string().optional(), // data desc
  value: z.any().optional(),

  debugLabel: z.string().optional(),

  description: z.string().optional(), // field desc
  toolDescription: z.string().optional(), // If this field is not empty, it is entered as a tool

  enum: z.string().optional(),
  inputList: z.array(InputConfigTypeSchema).optional(), // when key === 'system_input_config', this field is used

  // render components params
  canEdit: BoolSchema.optional(), // dynamic inputs
  isPro: BoolSchema.optional(), // Pro version field
  isToolOutput: BoolSchema.optional(),

  deprecated: BoolSchema.optional() // node deprecated
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
  required: BoolSchema.optional(),

  invalid: BoolSchema.optional(),
  invalidCondition: z
    .function({
      input: z.tuple([
        z.object({
          inputs: z.array(FlowNodeInputItemTypeSchema),
          llmModelMap: z.record(z.string(), LLMModelItemSchema)
        })
      ]),
      output: BoolSchema
    })
    .optional()
    .meta({
      override: {
        type: 'string',
        description: 'Function placeholder; not represented in JSON payloads'
      }
    }),

  customFieldConfig: CustomFieldConfigTypeSchema.optional(),
  deprecated: BoolSchema.optional()
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

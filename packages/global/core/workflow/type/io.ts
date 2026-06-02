import { LLMModelItemSchema } from '../../ai/model.schema';
import { WorkflowIOValueTypeEnum, NodeInputKeyEnum, NodeOutputKeyEnum } from '../constants';
import { FlowNodeInputTypeEnum, FlowNodeOutputTypeEnum } from '../node/constant';
import { SecretValueTypeSchema } from '../../../common/secret/type';
import z from 'zod';
import { BoolSchema, IntSchema, NumSchema } from '../../../common/zod';

/* Dataset node */
export const SelectedDatasetSchema = z.object({
  datasetId: z.string().meta({
    description: '可选知识库 ID'
  }),
  avatar: z.string().meta({
    description: '可选知识库头像'
  }),
  name: z.string().meta({
    description: '可选知识库名称'
  }),
  vectorModel: z.object({
    model: z.string().meta({
      description: '知识库使用的向量模型'
    })
  }),
  isDeleted: BoolSchema.optional()
});
export type SelectedDatasetType = z.infer<typeof SelectedDatasetSchema>;

// Dynamic input field configuration
export const CustomFieldConfigTypeSchema = z.object({
  // reference
  selectValueTypeList: z.array(z.enum(WorkflowIOValueTypeEnum)).optional().meta({
    description: '自定义输入允许选择的数据类型列表'
  }), // 可以选哪个数据类型, 只有1个的话,则默认选择
  showDefaultValue: BoolSchema.optional().meta({
    description: '是否在编辑器中展示默认值配置'
  }),
  showDescription: BoolSchema.optional().meta({
    description: '是否在编辑器中展示字段说明配置'
  }),
  hideBottomDivider: BoolSchema.optional().meta({
    description: '是否隐藏变量编辑区域底部分割线'
  })
});
export type CustomFieldConfigType = z.infer<typeof CustomFieldConfigTypeSchema>;

export const InputComponentPropsTypeSchema = z.object({
  key: z.enum(NodeInputKeyEnum).or(z.string()).meta({
    description: '变量键名，用于在提示词或工作流中引用该输入'
  }),
  label: z.string().meta({
    description: '变量展示名称'
  }),

  valueType: z.enum(WorkflowIOValueTypeEnum).optional().meta({
    description: '变量值的数据类型'
  }),
  required: BoolSchema.optional().meta({
    description: '该变量是否必填'
  }),
  defaultValue: z.any().optional().meta({
    description: '变量默认值'
  }),

  // 不同组件的配置嘻嘻
  referencePlaceholder: z.string().optional().meta({
    description: '引用变量时展示的占位提示'
  }),
  isRichText: BoolSchema.optional().meta({
    description: '是否使用富文本编辑器输入'
  }), // Prompt editor
  placeholder: z.string().optional().meta({
    description: '变量输入框占位提示'
  }), // input,textarea
  maxLength: IntSchema.optional().meta({
    description: '文本变量最大输入长度'
  }), // input,textarea
  minLength: IntSchema.optional().meta({
    description: '文本变量最小输入长度'
  }), // password
  list: z
    .array(
      z.object({
        label: z.string().meta({
          description: '变量选项展示名称'
        }),
        value: z.string().meta({
          description: '变量选项实际值'
        }),
        icon: z.string().optional().meta({
          description: '变量选项图标'
        }),
        description: z.string().optional().meta({
          description: '变量选项说明'
        })
      })
    )
    .optional()
    .meta({
      description: '选择类变量的可选项'
    }), // select
  markList: z
    .array(
      z.object({
        label: z.string().meta({
          description: '刻度展示名称'
        }),
        value: NumSchema.meta({
          description: '刻度值'
        })
      })
    )
    .optional()
    .meta({
      description: '数值滑块变量的刻度配置'
    }), // slider
  step: NumSchema.optional().meta({
    description: '数值变量步进值'
  }), // slider
  max: NumSchema.optional().meta({
    description: '数值变量最大值'
  }), // slider, number input
  min: NumSchema.optional().meta({
    description: '数值变量最小值'
  }), // slider, number input
  precision: NumSchema.optional().meta({
    description: '数值变量小数精度'
  }), // number input

  canSelectFile: BoolSchema.optional().meta({
    description: '该变量是否允许选择普通文件'
  }), // file select
  canSelectImg: BoolSchema.optional().meta({
    description: '该变量是否允许选择图片'
  }), // file select
  canSelectVideo: BoolSchema.optional().meta({
    description: '该变量是否允许选择视频'
  }), // file select
  canSelectAudio: BoolSchema.optional().meta({
    description: '该变量是否允许选择音频'
  }), // file select
  canSelectCustomFileExtension: BoolSchema.optional().meta({
    description: '该变量是否允许选择自定义扩展名文件'
  }), // file select
  customFileExtensionList: z.array(z.string()).optional().meta({
    description: '该变量允许选择的自定义文件扩展名列表'
  }), // file select
  canLocalUpload: BoolSchema.optional().meta({
    description: '该变量是否允许从本地上传文件'
  }), // file select
  canUrlUpload: BoolSchema.optional().meta({
    description: '该变量是否允许通过 URL 引入文件'
  }), // file select
  maxFiles: IntSchema.optional().meta({
    description: '该变量允许选择的最大文件数量'
  }), // file select

  // Time
  timeGranularity: z.enum(['day', 'hour', 'minute', 'second']).optional().meta({
    description: '时间变量的选择粒度'
  }), // time point select, time range select
  timeRangeStart: z.string().optional().meta({
    description: '时间范围变量的起始时间'
  }), // time range select
  timeRangeEnd: z.string().optional().meta({
    description: '时间范围变量的结束时间'
  }), // time range select

  // dataset select
  datasetOptions: z.array(SelectedDatasetSchema).optional().meta({
    description: '知识库选择变量的可选知识库列表'
  }),

  // dynamic input
  customInputConfig: CustomFieldConfigTypeSchema.optional().meta({
    description: '变量在编辑器中的自定义输入配置'
  }),

  enums: z
    .array(
      z.object({
        value: z.string().meta({
          description: '枚举项实际值'
        }),
        label: z.string().meta({
          description: '枚举项展示名称'
        })
      })
    )
    .optional()
    .meta({
      description: '已废弃：旧版枚举变量选项',
      deprecated: true
    })
});
export type InputComponentPropsType = z.infer<typeof InputComponentPropsTypeSchema>;

export const InputConfigInputTypeSchema = z.enum([
  'input',
  'numberInput',
  'secret',
  'switch',
  'select'
]);

export const InputConfigInputTypeEnum = InputConfigInputTypeSchema.enum;

export type InputConfigInputTypeType = z.infer<typeof InputConfigInputTypeSchema>;

/** 系统密钥输入配置 */
export const InputConfigTypeSchema = z.object({
  key: z.string().meta({
    description: '输入配置键名'
  }),
  label: z.string().meta({
    description: '输入配置展示名称'
  }),
  description: z.string().optional().meta({
    description: '输入配置说明'
  }),
  required: BoolSchema.optional().meta({
    description: '该输入配置是否必填'
  }),
  inputType: InputConfigInputTypeSchema.meta({
    description: '输入配置渲染组件类型'
  }),
  value: SecretValueTypeSchema.optional().meta({
    description: '输入配置默认值或密钥值'
  }),

  // Selector
  list: z
    .array(
      z.object({
        label: z.string().meta({
          description: '配置项展示名称'
        }),
        value: z.string().meta({
          description: '配置项实际值'
        })
      })
    )
    .optional()
    .meta({
      description: '选择类输入配置的可选项'
    })
});
export type InputConfigType = z.infer<typeof InputConfigTypeSchema>;

// Workflow node input
export const FlowNodeInputItemTypeSchema = InputComponentPropsTypeSchema.extend({
  selectedTypeIndex: IntSchema.optional().meta({
    description: '多类型输入当前选中的类型索引'
  }),
  renderTypeList: z.array(z.enum(FlowNodeInputTypeEnum)).meta({
    description: '该输入在编辑器中允许使用的渲染组件类型'
  }), // Node Type. Decide on a render style
  valueDesc: z.string().optional().meta({
    description: '输入值说明，通常用于展示引用值含义'
  }), // data desc
  value: z.any().optional().meta({
    description: '节点输入当前值'
  }),

  debugLabel: z.string().optional().meta({
    description: '调试模式下展示的输入名称'
  }),

  description: z.string().optional().meta({
    description: '节点输入说明'
  }), // field desc
  toolDescription: z.string().optional().meta({
    description: '作为工具调用参数时的语义说明'
  }), // If this field is not empty, it is entered as a tool

  enum: z.string().optional().meta({
    description: '已废弃：旧版枚举配置'
  }),
  inputList: z.array(InputConfigTypeSchema).optional().meta({
    description: '系统输入配置项列表'
  }), // when key === 'system_input_config', this field is used

  // render components params
  canEdit: BoolSchema.optional().meta({
    description: '该输入是否允许在编辑器中修改'
  }), // dynamic inputs
  isPro: BoolSchema.optional().meta({
    description: '该输入是否为商业版能力'
  }), // Pro version field
  isToolOutput: BoolSchema.optional().meta({
    description: '该输入是否来自工具输出'
  }),

  deprecated: BoolSchema.optional().meta({
    description: '该输入是否已废弃'
  }) // node deprecated
});
export type FlowNodeInputItemType = z.infer<typeof FlowNodeInputItemTypeSchema>;

// Workflow node output
export const FlowNodeOutputItemTypeSchema = z.object({
  id: z.string().meta({
    description: '节点输出 ID'
  }),
  key: z.enum(NodeOutputKeyEnum).or(z.string()).meta({
    description: '节点输出键名，用于被下游节点引用'
  }),
  type: z.enum(FlowNodeOutputTypeEnum).meta({
    description: '节点输出渲染和生成方式'
  }),
  valueType: z.enum(WorkflowIOValueTypeEnum).optional().meta({
    description: '节点输出值的数据类型'
  }),
  valueDesc: z.string().optional().meta({
    description: '输出值说明，通常用于展示引用值含义'
  }),
  value: z.any().optional().meta({
    description: '节点输出默认值或静态值'
  }),

  label: z.string().optional().meta({
    description: '节点输出展示名称'
  }),
  description: z.string().optional().meta({
    description: '节点输出说明'
  }),
  defaultValue: z.any().optional().meta({
    description: '节点输出默认值'
  }),
  required: BoolSchema.optional().meta({
    description: '该输出是否为必需输出'
  }),

  invalid: BoolSchema.optional().meta({
    description: '该输出当前是否不可用'
  }),
  invalidCondition: z
    .function({
      input: z.tuple([
        z.object({
          inputs: z.custom<FlowNodeInputItemType[]>(),
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

  customFieldConfig: CustomFieldConfigTypeSchema.optional().meta({
    description: '动态输出项编辑配置'
  }),
  deprecated: BoolSchema.optional().meta({
    description: '该输出是否已废弃'
  })
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

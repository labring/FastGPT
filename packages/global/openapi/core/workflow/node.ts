import z from 'zod';
import {
  CustomFieldConfigTypeSchema,
  FlowNodeInputItemTypeSchema,
  FlowNodeOutputItemTypeSchema,
  InputConfigTypeSchema,
  SelectedDatasetSchema
} from '../../../core/workflow/type/io';
import {
  NodeToolConfigTypeSchema,
  StoreNodeItemTypeSchema,
  ToolDataSchema
} from '../../../core/workflow/type/node';
import { McpToolConfigSchema } from '../../../core/app/tool/mcpTool/type';
import { HttpToolConfigTypeSchema } from '../../../core/app/tool/httpTool/type';
import { ContentTypes } from '../../../core/workflow/constants';

const OpenAPISecretValueSchema = z
  .object({
    value: z.string().optional().meta({
      description: '密钥明文值；提交明文时会优先使用该值'
    }),
    secret: z.string().optional().meta({
      description: '已加密或脱敏后的密钥值'
    })
  })
  .meta({
    description: '密钥值配置'
  });

const OpenAPISelectedDatasetSchema = SelectedDatasetSchema.extend({
  datasetId: z.string().meta({
    description: '输入项可选择的知识库 ID'
  }),
  avatar: z.string().meta({
    description: '输入项可选择的知识库头像'
  }),
  name: z.string().meta({
    description: '输入项可选择的知识库名称'
  }),
  vectorModel: z
    .object({
      model: z.string().meta({
        description: '知识库使用的向量模型'
      })
    })
    .meta({
      description: '知识库向量模型配置'
    })
}).meta({
  description: '节点输入项可选择的知识库'
});

const OpenAPICustomFieldConfigTypeSchema = CustomFieldConfigTypeSchema.extend({
  selectValueTypeList: CustomFieldConfigTypeSchema.shape.selectValueTypeList.meta({
    description: '动态输入项允许选择的数据类型列表'
  }),
  showDefaultValue: CustomFieldConfigTypeSchema.shape.showDefaultValue.meta({
    description: '是否在动态输入项中展示默认值配置'
  }),
  showDescription: CustomFieldConfigTypeSchema.shape.showDescription.meta({
    description: '是否在动态输入项中展示字段说明配置'
  }),
  hideBottomDivider: CustomFieldConfigTypeSchema.shape.hideBottomDivider.meta({
    description: '是否隐藏动态输入项底部分割线'
  })
}).meta({
  description: '动态输入项编辑配置'
});

const OpenAPIInputConfigListItemSchema = z
  .object({
    label: z.string().meta({
      description: '配置项展示名称'
    }),
    value: z.string().meta({
      description: '配置项实际值'
    })
  })
  .meta({
    description: '输入配置可选项'
  });

const OpenAPIInputConfigTypeSchema = InputConfigTypeSchema.extend({
  key: z.string().meta({
    description: '输入配置键名'
  }),
  label: z.string().meta({
    description: '输入配置展示名称'
  }),
  description: z.string().optional().meta({
    description: '输入配置说明'
  }),
  required: InputConfigTypeSchema.shape.required.meta({
    description: '该输入配置是否必填'
  }),
  inputType: InputConfigTypeSchema.shape.inputType.meta({
    description: '输入配置渲染组件类型'
  }),
  value: OpenAPISecretValueSchema.optional().meta({
    description: '输入配置默认值或密钥值'
  }),
  list: z.array(OpenAPIInputConfigListItemSchema).optional().meta({
    description: '选择类输入配置的可选项'
  })
}).meta({
  description: '节点输入配置项'
});

const OpenAPIInputSelectOptionSchema = z
  .object({
    label: z.string().meta({
      description: '输入选项展示名称'
    }),
    value: z.string().meta({
      description: '输入选项实际值'
    }),
    icon: z.string().optional().meta({
      description: '输入选项图标'
    }),
    description: z.string().optional().meta({
      description: '输入选项说明'
    })
  })
  .meta({
    description: '节点输入可选项'
  });

const OpenAPIInputMarkItemSchema = z
  .object({
    label: z.string().meta({
      description: '刻度展示名称'
    }),
    value: z.number().meta({
      description: '刻度值'
    })
  })
  .meta({
    description: '节点输入数值刻度'
  });

const OpenAPIInputEnumItemSchema = z
  .object({
    value: z.string().meta({
      description: '枚举项实际值'
    }),
    label: z.string().meta({
      description: '枚举项展示名称'
    })
  })
  .meta({
    description: '节点输入枚举项'
  });

const OpenAPIFlowNodeInputItemTypeSchema = FlowNodeInputItemTypeSchema.extend({
  key: FlowNodeInputItemTypeSchema.shape.key.meta({
    description: '节点输入键名，用于在节点配置和运行时读取该输入'
  }),
  label: z.string().meta({
    description: '节点输入展示名称'
  }),
  valueType: FlowNodeInputItemTypeSchema.shape.valueType.meta({
    description: '节点输入值的数据类型'
  }),
  required: FlowNodeInputItemTypeSchema.shape.required.meta({
    description: '节点运行时该输入是否必填'
  }),
  defaultValue: z.any().optional().meta({
    description: '节点输入默认值'
  }),
  referencePlaceholder: z.string().optional().meta({
    description: '引用上游输出时展示的占位提示'
  }),
  isRichText: FlowNodeInputItemTypeSchema.shape.isRichText.meta({
    description: '该输入是否使用富文本编辑器'
  }),
  placeholder: z.string().optional().meta({
    description: '节点输入框占位提示'
  }),
  maxLength: FlowNodeInputItemTypeSchema.shape.maxLength.meta({
    description: '文本输入最大长度'
  }),
  minLength: FlowNodeInputItemTypeSchema.shape.minLength.meta({
    description: '文本输入最小长度'
  }),
  list: z.array(OpenAPIInputSelectOptionSchema).optional().meta({
    description: '选择类输入的可选项'
  }),
  markList: z.array(OpenAPIInputMarkItemSchema).optional().meta({
    description: '滑块类输入的刻度配置'
  }),
  step: FlowNodeInputItemTypeSchema.shape.step.meta({
    description: '数值输入步进值'
  }),
  max: FlowNodeInputItemTypeSchema.shape.max.meta({
    description: '数值输入最大值'
  }),
  min: FlowNodeInputItemTypeSchema.shape.min.meta({
    description: '数值输入最小值'
  }),
  precision: FlowNodeInputItemTypeSchema.shape.precision.meta({
    description: '数值输入小数精度'
  }),
  canSelectFile: FlowNodeInputItemTypeSchema.shape.canSelectFile.meta({
    description: '该输入是否允许选择普通文件'
  }),
  canSelectImg: FlowNodeInputItemTypeSchema.shape.canSelectImg.meta({
    description: '该输入是否允许选择图片'
  }),
  canSelectVideo: FlowNodeInputItemTypeSchema.shape.canSelectVideo.meta({
    description: '该输入是否允许选择视频'
  }),
  canSelectAudio: FlowNodeInputItemTypeSchema.shape.canSelectAudio.meta({
    description: '该输入是否允许选择音频'
  }),
  canSelectCustomFileExtension: FlowNodeInputItemTypeSchema.shape.canSelectCustomFileExtension.meta(
    {
      description: '该输入是否允许选择自定义扩展名文件'
    }
  ),
  customFileExtensionList: z.array(z.string()).optional().meta({
    description: '该输入允许选择的自定义文件扩展名列表'
  }),
  canLocalUpload: FlowNodeInputItemTypeSchema.shape.canLocalUpload.meta({
    description: '该输入是否允许本地上传文件'
  }),
  canUrlUpload: FlowNodeInputItemTypeSchema.shape.canUrlUpload.meta({
    description: '该输入是否允许通过 URL 引入文件'
  }),
  maxFiles: FlowNodeInputItemTypeSchema.shape.maxFiles.meta({
    description: '该输入允许选择的最大文件数量'
  }),
  timeGranularity: FlowNodeInputItemTypeSchema.shape.timeGranularity.meta({
    description: '时间输入的选择粒度'
  }),
  timeRangeStart: z.string().optional().meta({
    description: '时间范围输入的起始时间'
  }),
  timeRangeEnd: z.string().optional().meta({
    description: '时间范围输入的结束时间'
  }),
  datasetOptions: z.array(OpenAPISelectedDatasetSchema).optional().meta({
    description: '知识库选择输入的可选知识库列表'
  }),
  customInputConfig: OpenAPICustomFieldConfigTypeSchema.optional().meta({
    description: '动态输入项编辑配置'
  }),
  enums: z.array(OpenAPIInputEnumItemSchema).optional().meta({
    description: '已废弃：旧版输入枚举项'
  }),
  selectedTypeIndex: FlowNodeInputItemTypeSchema.shape.selectedTypeIndex.meta({
    description: '多类型输入当前选中的类型索引'
  }),
  renderTypeList: FlowNodeInputItemTypeSchema.shape.renderTypeList.meta({
    description: '该输入在编辑器中允许使用的渲染组件类型'
  }),
  valueDesc: z.string().optional().meta({
    description: '输入值说明，通常用于展示引用值含义'
  }),
  value: z.any().optional().meta({
    description: '节点输入当前值'
  }),
  debugLabel: z.string().optional().meta({
    description: '调试模式下展示的输入名称'
  }),
  description: z.string().optional().meta({
    description: '节点输入说明'
  }),
  toolDescription: z.string().optional().meta({
    description: '作为工具调用参数时的语义说明'
  }),
  enum: z.string().optional().meta({
    description: '已废弃：旧版枚举配置'
  }),
  inputList: z.array(OpenAPIInputConfigTypeSchema).optional().meta({
    description: '系统输入配置项列表'
  }),
  canEdit: FlowNodeInputItemTypeSchema.shape.canEdit.meta({
    description: '该输入是否允许在编辑器中修改'
  }),
  isPro: FlowNodeInputItemTypeSchema.shape.isPro.meta({
    description: '该输入是否为商业版能力'
  }),
  isToolOutput: FlowNodeInputItemTypeSchema.shape.isToolOutput.meta({
    description: '该输入是否来自工具输出'
  }),
  deprecated: FlowNodeInputItemTypeSchema.shape.deprecated.meta({
    description: '该输入是否已废弃'
  })
}).meta({
  description: '工作流节点输入配置'
});

// `invalidCondition` in FlowNodeOutputItemTypeSchema is a Zod function schema used only
// by the editor to validate outputs; function schemas cannot be represented in JSON
// Schema, so we strip it before exposing via OpenAPI.
const OpenAPIFlowNodeOutputItemTypeSchema = FlowNodeOutputItemTypeSchema.omit({
  invalidCondition: true
})
  .extend({
    id: z.string().meta({
      description: '节点输出 ID'
    }),
    key: FlowNodeOutputItemTypeSchema.shape.key.meta({
      description: '节点输出键名，用于被下游节点引用'
    }),
    type: FlowNodeOutputItemTypeSchema.shape.type.meta({
      description: '节点输出渲染和生成方式'
    }),
    valueType: FlowNodeOutputItemTypeSchema.shape.valueType.meta({
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
    required: FlowNodeOutputItemTypeSchema.shape.required.meta({
      description: '该输出是否为必需输出'
    }),
    invalid: FlowNodeOutputItemTypeSchema.shape.invalid.meta({
      description: '该输出当前是否不可用'
    }),
    customFieldConfig: OpenAPICustomFieldConfigTypeSchema.optional().meta({
      description: '动态输出项编辑配置'
    }),
    deprecated: FlowNodeOutputItemTypeSchema.shape.deprecated.meta({
      description: '该输出是否已废弃'
    })
  })
  .meta({
    description: '工作流节点输出配置'
  });

const OpenAPIToolDataSchema = ToolDataSchema.extend({
  diagram: z.string().optional().meta({
    description: '工具说明图地址'
  }),
  userGuide: z.string().optional().meta({
    description: '工具使用指引'
  }),
  courseUrl: z.string().optional().meta({
    description: '工具教程地址'
  }),
  name: z.string().optional().meta({
    description: '工具展示名称'
  }),
  avatar: z.string().optional().meta({
    description: '工具头像'
  }),
  error: z.string().optional().meta({
    description: '工具配置错误说明'
  }),
  status: ToolDataSchema.shape.status.meta({
    description: '工具当前状态'
  })
}).meta({
  description: '节点关联工具展示信息'
});

const OpenAPIMcpToolConfigSchema = McpToolConfigSchema.extend({
  name: z.string().meta({
    description: 'MCP 工具名称'
  }),
  description: z.string().meta({
    description: 'MCP 工具能力说明'
  }),
  inputSchema: McpToolConfigSchema.shape.inputSchema.meta({
    description: 'MCP 工具入参 JSON Schema'
  })
}).meta({
  description: 'MCP 工具配置'
});

const OpenAPIHttpToolStaticKeyValueSchema = z
  .object({
    key: z.string().meta({
      description: '固定参数或请求头名称'
    }),
    value: z.string().meta({
      description: '固定参数或请求头值'
    })
  })
  .meta({
    description: 'HTTP 工具固定键值配置'
  });

const OpenAPIHttpToolStaticBodySchema = z
  .object({
    type: z.enum(ContentTypes).meta({
      description: '静态请求体内容类型'
    }),
    content: z.string().optional().meta({
      description: '静态请求体文本内容，适用于 JSON、XML 或 Raw 文本'
    }),
    formData: z.array(OpenAPIHttpToolStaticKeyValueSchema).optional().meta({
      description: '表单类型请求体的固定字段列表'
    })
  })
  .optional()
  .meta({
    description: 'HTTP 工具静态请求体'
  });

const OpenAPIHttpToolConfigSchema = HttpToolConfigTypeSchema.extend({
  name: z.string().meta({
    description: 'HTTP 工具名称'
  }),
  description: z.string().meta({
    description: 'HTTP 工具能力说明'
  }),
  inputSchema: HttpToolConfigTypeSchema.shape.inputSchema.meta({
    description: 'HTTP 工具入参 JSON Schema'
  }),
  outputSchema: HttpToolConfigTypeSchema.shape.outputSchema.meta({
    description: 'HTTP 工具出参 JSON Schema'
  }),
  path: z.string().meta({
    description: 'HTTP 工具请求路径'
  }),
  method: z.string().meta({
    description: 'HTTP 工具请求方法'
  }),
  requestSchema: HttpToolConfigTypeSchema.shape.requestSchema.meta({
    description: 'HTTP 工具原始请求结构 JSON Schema'
  }),
  staticParams: z.array(OpenAPIHttpToolStaticKeyValueSchema).optional().meta({
    description: 'HTTP 工具固定 Query 参数'
  }),
  staticHeaders: z.array(OpenAPIHttpToolStaticKeyValueSchema).optional().meta({
    description: 'HTTP 工具固定请求头'
  }),
  staticBody: OpenAPIHttpToolStaticBodySchema,
  headerSecret: HttpToolConfigTypeSchema.shape.headerSecret.meta({
    description: 'HTTP 工具请求头密钥配置'
  })
}).meta({
  description: 'HTTP 工具配置'
});

const OpenAPIMcpToolSetConfigSchema = NodeToolConfigTypeSchema.shape.mcpToolSet.unwrap().extend({
  url: z.string().meta({
    description: 'MCP 服务地址'
  }),
  headerSecret: NodeToolConfigTypeSchema.shape.mcpToolSet.unwrap().shape.headerSecret.meta({
    description: 'MCP 服务请求头密钥配置'
  }),
  toolList: z.array(OpenAPIMcpToolConfigSchema).meta({
    description: 'MCP 工具集包含的工具列表'
  })
});

const OpenAPIToolRefSchema = z
  .object({
    toolId: z.string().meta({
      description: '节点引用的工具 ID'
    })
  })
  .meta({
    description: '节点引用的工具配置'
  });

const OpenAPISystemToolItemSchema = z
  .object({
    toolId: z.string().meta({
      description: '系统工具 ID'
    }),
    name: z.string().meta({
      description: '系统工具名称'
    }),
    description: z.string().meta({
      description: '系统工具能力说明'
    })
  })
  .meta({
    description: '系统工具配置项'
  });

const OpenAPISystemToolSetConfigSchema = NodeToolConfigTypeSchema.shape.systemToolSet
  .unwrap()
  .extend({
    toolId: z.string().meta({
      description: '系统工具集 ID'
    }),
    toolList: z.array(OpenAPISystemToolItemSchema).meta({
      description: '系统工具集包含的工具列表'
    })
  });

const OpenAPIHttpToolSetConfigSchema = NodeToolConfigTypeSchema.shape.httpToolSet.unwrap().extend({
  toolList: z.array(OpenAPIHttpToolConfigSchema).meta({
    description: 'HTTP 工具集包含的工具列表'
  }),
  baseUrl: z.string().optional().meta({
    description: 'HTTP 工具集请求基础地址'
  }),
  apiSchemaStr: z.string().optional().meta({
    description: 'HTTP 工具集导入的 OpenAPI Schema 原始内容'
  }),
  customHeaders: z.string().optional().meta({
    description: 'HTTP 工具集公共请求头 JSON 字符串'
  }),
  headerSecret: NodeToolConfigTypeSchema.shape.httpToolSet.unwrap().shape.headerSecret.meta({
    description: 'HTTP 工具集请求头密钥配置'
  })
});

const OpenAPINodeToolConfigTypeSchema = NodeToolConfigTypeSchema.extend({
  mcpToolSet: OpenAPIMcpToolSetConfigSchema.optional().meta({
    description: '节点绑定的 MCP 工具集配置'
  }),
  mcpTool: OpenAPIToolRefSchema.optional().meta({
    description: '节点绑定的 MCP 单工具配置'
  }),
  systemTool: OpenAPIToolRefSchema.optional().meta({
    description: '节点绑定的系统单工具配置'
  }),
  systemToolSet: OpenAPISystemToolSetConfigSchema.optional().meta({
    description: '节点绑定的系统工具集配置'
  }),
  httpToolSet: OpenAPIHttpToolSetConfigSchema.optional().meta({
    description: '节点绑定的 HTTP 工具集配置'
  }),
  httpTool: OpenAPIToolRefSchema.optional().meta({
    description: '节点绑定的 HTTP 单工具配置'
  })
}).meta({
  description: '节点工具配置'
});

export const OpenAPIStoreNodeItemTypeSchema = StoreNodeItemTypeSchema.omit({
  inputs: true,
  outputs: true,
  pluginData: true,
  toolConfig: true,
  position: true
})
  .extend({
    parentNodeId: z.string().optional().meta({
      description: '父节点 ID，用于循环、分组等嵌套节点场景'
    }),
    flowNodeType: StoreNodeItemTypeSchema.shape.flowNodeType.meta({
      description: '工作流节点类型'
    }),
    abandon: z.boolean().optional().meta({
      description: '节点是否被废弃或隐藏'
    }),
    avatar: z.string().optional().meta({
      description: '节点头像'
    }),
    avatarLinear: z.string().optional().meta({
      description: '节点头像渐变色配置'
    }),
    colorSchema: StoreNodeItemTypeSchema.shape.colorSchema.meta({
      description: '节点在编辑器中的配色方案'
    }),
    name: z.string().meta({
      description: '节点名称'
    }),
    intro: z.string().optional().meta({
      description: '节点简介'
    }),
    toolDescription: z.string().optional().meta({
      description: '节点作为工具被调用时的能力说明'
    }),
    showStatus: z.boolean().optional().meta({
      description: '对话运行时是否展示该节点执行状态'
    }),
    version: z.string().optional().meta({
      description: '节点实现版本'
    }),
    versionLabel: z.string().optional().meta({
      description: '节点版本展示名称'
    }),
    isLatestVersion: z.boolean().optional().meta({
      description: '该节点是否为当前最新版本'
    }),
    catchError: z.boolean().optional().meta({
      description: '节点执行异常时是否进入错误捕获流程'
    }),
    inputs: z.array(OpenAPIFlowNodeInputItemTypeSchema).meta({
      description: '节点输入配置列表'
    }),
    outputs: z.array(OpenAPIFlowNodeOutputItemTypeSchema).meta({
      description: '节点输出配置列表'
    }),
    pluginId: z.string().optional().meta({
      description: '节点关联的插件 ID'
    }),
    isFolder: z.boolean().optional().meta({
      description: '该节点是否为文件夹节点'
    }),
    pluginData: OpenAPIToolDataSchema.optional().meta({
      description: '节点关联插件或工具的展示信息'
    }),
    toolConfig: OpenAPINodeToolConfigTypeSchema.optional().meta({
      description: '节点绑定的工具配置'
    }),
    currentCost: z.number().optional().meta({
      description: '节点当前预估积分消耗'
    }),
    systemKeyCost: z.number().optional().meta({
      description: '节点使用系统密钥产生的额外积分费用'
    }),
    hasTokenFee: z.boolean().optional().meta({
      description: '节点运行是否会产生模型 token 费用'
    }),
    hasSystemSecret: z.boolean().optional().meta({
      description: '节点是否使用系统级密钥'
    }),
    nodeId: z.string().meta({
      description: '工作流节点 ID'
    }),
    position: z
      .object({
        x: z.number().meta({
          description: '节点在画布中的横坐标'
        }),
        y: z.number().meta({
          description: '节点在画布中的纵坐标'
        })
      })
      .optional()
      .meta({
        description: '节点在工作流画布中的位置'
      })
  })
  .meta({
    description: '应用工作流节点配置'
  });

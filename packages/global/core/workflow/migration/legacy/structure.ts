import { VariableInputEnum, WorkflowIOValueTypeEnum } from '../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../node/constant';
import { PluginStatusEnum } from '../../../plugin/type';

const inputTypes = new Set(Object.values(FlowNodeInputTypeEnum));
const outputTypes = new Set(Object.values(FlowNodeOutputTypeEnum));
const nodeTypes = new Set(Object.values(FlowNodeTypeEnum));
const legacyNodeTypes = new Set(['userGuide', 'pluginConfig']);
const valueTypes = new Set(Object.values(WorkflowIOValueTypeEnum));
const variableTypes = new Set(Object.values(VariableInputEnum));
// 这些字段在历史数据中允许为 null；迁移后删除 null，让 canonical schema 只接收有效值或缺省值。
const optionalNodeFields = [
  'parentNodeId',
  'avatar',
  'avatarLinear',
  'intro',
  'toolDescription',
  'version',
  'versionLabel',
  'pluginId',
  'source',
  'readmeUrl',
  'position',
  'toolConfig',
  'pluginData',
  'abandon',
  'showStatus',
  'isLatestVersion',
  'catchError',
  'isFolder',
  'hasTokenFee',
  'hasSystemSecret',
  'currentCost',
  'systemKeyCost'
];
// 输入字段同样清理历史 null，保留有业务意义的空字符串、false 和 0。
const optionalInputFields = [
  'referencePlaceholder',
  'placeholder',
  'valueDesc',
  'debugLabel',
  'description',
  'toolDescription',
  'enum',
  'list',
  'markList',
  'inputList',
  'required',
  'canEdit',
  'isPro',
  'isToolOutput',
  'deprecated',
  'maxLength',
  'minLength',
  'step',
  'max',
  'min',
  'precision'
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const enumExpressionValue = <T extends Record<string, string>>({
  value,
  enumObject,
  prefix
}: {
  value: unknown;
  enumObject: T;
  prefix: string;
}) => {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return value;
  const key = value.slice(prefix.length);
  return enumObject[key as keyof T] ?? value;
};
const normalizeValueType = (value: unknown) => {
  const normalized = enumExpressionValue({
    value,
    enumObject: WorkflowIOValueTypeEnum,
    prefix: 'WorkflowIOValueTypeEnum.'
  });
  return normalized === undefined ||
    (typeof normalized === 'string' && valueTypes.has(normalized as any))
    ? normalized
    : WorkflowIOValueTypeEnum.any;
};
const normalizeInputType = (value: unknown) =>
  enumExpressionValue({
    value,
    enumObject: FlowNodeInputTypeEnum,
    prefix: 'FlowNodeInputTypeEnum.'
  });
const normalizeOutputType = (value: unknown) =>
  enumExpressionValue({
    value,
    enumObject: FlowNodeOutputTypeEnum,
    prefix: 'FlowNodeOutputTypeEnum.'
  });

/** Repair deterministic storage defects before the strict V2 boundary schema runs. */
export const migrateLegacyWorkflowStructureData = ({
  nodes,
  edges,
  chatConfig
}: {
  nodes: unknown[];
  edges: unknown;
  chatConfig: unknown;
}) => {
  const normalizeToolConfig = (value: unknown) => {
    if (!isRecord(value)) return value === null ? undefined : value;
    const toolConfig = { ...value };
    const systemToolSet = toolConfig.systemToolSet;
    if (isRecord(systemToolSet) && Array.isArray(systemToolSet.toolList)) {
      // 旧 systemToolSet 的子工具可能只有 key 或 name；补出稳定 toolId、name 和 description。
      toolConfig.systemToolSet = {
        ...systemToolSet,
        toolList: systemToolSet.toolList.filter(isRecord).map((tool, index) => {
          const toolId =
            typeof tool.toolId === 'string' && tool.toolId
              ? tool.toolId
              : typeof tool.key === 'string' && tool.key
                ? tool.key
                : typeof tool.name === 'string' && tool.name
                  ? tool.name
                  : `${String(systemToolSet.toolId ?? 'systemTool')}_${index}`;
          return {
            ...tool,
            toolId,
            name: typeof tool.name === 'string' ? tool.name : toolId,
            description: typeof tool.description === 'string' ? tool.description : ''
          };
        })
      };
    }
    if (
      isRecord(toolConfig.httpToolSet) &&
      typeof toolConfig.httpToolSet.customHeaders !== 'string'
    ) {
      // 历史 HTTP ToolSet 的 customHeaders 曾保存为布尔值等非字符串，当前结构不再保留该字段。
      const { customHeaders: _, ...httpToolSet } = toolConfig.httpToolSet;
      toolConfig.httpToolSet = httpToolSet;
    }
    return toolConfig;
  };
  const normalizePluginData = (value: unknown) => {
    if (!isRecord(value)) return value === null ? undefined : value;
    const pluginData = { ...value };
    // 插件展示字段的 null 没有有效语义，删除后交给当前默认值或 schema 处理。
    ['diagram', 'userGuide', 'courseUrl', 'readmeUrl', 'name', 'avatar', 'error'].forEach((key) => {
      if (pluginData[key] === null) delete pluginData[key];
    });
    if (pluginData.status !== undefined) {
      // 旧数据使用 1/2/3 数字状态；转换为当前枚举，未知状态直接删除。
      const status =
        typeof pluginData.status === 'number'
          ? ({
              1: PluginStatusEnum.Normal,
              2: PluginStatusEnum.SoonOffline,
              3: PluginStatusEnum.Offline
            }[pluginData.status] ?? undefined)
          : pluginData.status;
      if (
        Object.values(PluginStatusEnum).includes(
          status as (typeof PluginStatusEnum)[keyof typeof PluginStatusEnum]
        )
      ) {
        pluginData.status = status;
      } else {
        delete pluginData.status;
      }
    }
    return pluginData;
  };
  const normalizeInputList = (value: unknown) => {
    if (!Array.isArray(value)) return value === null ? undefined : value;
    return value.map((item) => {
      if (!isRecord(item) || typeof item.value === 'object' || item.value === undefined)
        return item;
      if (typeof item.value !== 'string' && typeof item.value !== 'number') return item;
      // 历史 secret/inputList 值可能直接保存为原始字符串或数字，当前协议要求 { value } 包装。
      return { ...item, value: { value: String(item.value) } };
    });
  };
  const normalizedNodes = nodes.map((value, index) => {
    if (!isRecord(value)) {
      // 非对象节点无法恢复原始内容，保留位置并降级为空节点，保证整个 workflow 可继续迁移。
      return {
        nodeId: `legacy-${index}`,
        name: FlowNodeTypeEnum.emptyNode,
        flowNodeType: FlowNodeTypeEnum.emptyNode,
        inputs: [],
        outputs: []
      };
    }
    const node = { ...value };
    // React Flow 的 id 只属于画布运行态；历史持久化数据携带它时必须在 canonical 边界删除。
    delete node.id;
    // 清理节点可选字段中的 null；null 在当前 schema 中等价于字段缺省。
    optionalNodeFields.forEach((key) => {
      if (node[key] === null) delete node[key];
    });
    // 历史版本号可能是数字，统一转成当前持久化格式的字符串。
    if (typeof node.version === 'number') node.version = String(node.version);
    // 优先复用旧 moduleId 作为 nodeId，缺失时生成稳定的批次内兜底 ID。
    if (typeof node.nodeId !== 'string' || node.nodeId.length === 0) {
      node.nodeId =
        typeof node.moduleId === 'string' && node.moduleId ? node.moduleId : `legacy-${index}`;
    }
    // 节点名称缺失时使用 flowNodeType 或 nodeId，保证 UI 和 schema 获得字符串。
    if (typeof node.name !== 'string')
      node.name = String(node.flowNodeType ?? node.flowType ?? node.nodeId);
    if (
      node.flowNodeType === 'lafModule' ||
      typeof node.flowNodeType !== 'string' ||
      (!nodeTypes.has(node.flowNodeType as FlowNodeTypeEnum) &&
        !legacyNodeTypes.has(node.flowNodeType))
    ) {
      // lafModule、未知类型和非字符串类型无法由当前 runtime 执行，统一降级为空节点。
      node.flowNodeType = FlowNodeTypeEnum.emptyNode;
    }
    node.inputs = (Array.isArray(node.inputs) ? node.inputs : []).map((value, inputIndex) => {
      const input = isRecord(value) ? { ...value } : {};
      // 非对象输入降级为空对象，后续规则补齐 key、label 和类型字段。
      optionalInputFields.forEach((key) => {
        if (input[key] === null) delete input[key];
      });
      if (typeof input.key !== 'string') input.key = `inputs_${inputIndex}`;
      if (typeof input.label !== 'string') input.label = input.key;
      // 将字符串形式的枚举表达式还原为枚举值，并过滤当前版本无法识别的输入类型。
      const renderTypeList = Array.isArray(input.renderTypeList)
        ? input.renderTypeList
            .map(normalizeInputType)
            .filter(
              (type): type is FlowNodeInputTypeEnum =>
                typeof type === 'string' && inputTypes.has(type as FlowNodeInputTypeEnum)
            )
        : [];
      input.renderTypeList = renderTypeList;
      // 缺失或非法 valueType 统一使用 any，避免严格 schema 阻断整条 workflow。
      input.valueType = normalizeValueType(input.valueType);
      const inputList = normalizeInputList(input.inputList);
      // null inputList 表示历史字段缺省；保留合法数组或其他原始值交给后续 schema 判断。
      if (inputList === undefined) delete input.inputList;
      else input.inputList = inputList;
      return input;
    });
    node.outputs = (Array.isArray(node.outputs) ? node.outputs : []).map((value, outputIndex) => {
      const output = isRecord(value) ? { ...value } : {};
      // 输出缺少 key/id/label 时按数组位置补齐稳定字段。
      if (typeof output.key !== 'string') output.key = `outputs_${outputIndex}`;
      if (typeof output.id !== 'string') output.id = output.key;
      if (typeof output.label !== 'string') output.label = output.key;
      // 还原输出类型枚举；未知类型按普通静态输出处理。
      const type = normalizeOutputType(output.type);
      output.type =
        typeof type === 'string' && outputTypes.has(type as FlowNodeOutputTypeEnum)
          ? type
          : FlowNodeOutputTypeEnum.static;
      // 输出 valueType 与输入使用同一套兼容规则。
      output.valueType = normalizeValueType(output.valueType);
      return output;
    });
    const toolConfig = normalizeToolConfig(node.toolConfig);
    // null toolConfig/pluginData 表示字段缺省，删除后避免把 null 写回 canonical 数据。
    if (toolConfig === undefined) delete node.toolConfig;
    else node.toolConfig = toolConfig;
    const pluginData = normalizePluginData(node.pluginData);
    if (pluginData === undefined) delete node.pluginData;
    else node.pluginData = pluginData;
    return node;
  });
  const normalizedChatConfig = isRecord(chatConfig) ? { ...chatConfig } : {};
  // chatConfig 缺失、非对象或包含 null 字段时，先归一为可继续迁移的对象。
  Object.keys(normalizedChatConfig).forEach((key) => {
    if (normalizedChatConfig[key] === null) delete normalizedChatConfig[key];
  });
  if (typeof normalizedChatConfig.questionGuide === 'boolean') {
    // 历史 questionGuide 使用布尔值；当前格式要求包含 open 字段的配置对象。
    normalizedChatConfig.questionGuide = { open: normalizedChatConfig.questionGuide };
  }
  if (Array.isArray(normalizedChatConfig.variables)) {
    // 变量列表只保留对象，并补齐当前 schema 依赖的 key、label、description、valueType 和 type。
    normalizedChatConfig.variables = normalizedChatConfig.variables
      .filter(isRecord)
      .map((value, index) => {
        const variable = { ...value };
        // 缺少 key/label/description 时使用稳定兜底值，保证变量可被引用和展示。
        if (typeof variable.key !== 'string' || !variable.key) variable.key = `variable_${index}`;
        if (typeof variable.label !== 'string') variable.label = variable.key;
        if (typeof variable.description !== 'string') variable.description = '';
        variable.valueType = normalizeValueType(variable.valueType);
        // 兼容旧的语义类型名称，并将未知类型降级为普通输入。
        variable.type =
          {
            string: VariableInputEnum.input,
            text: VariableInputEnum.input,
            number: VariableInputEnum.numberInput,
            boolean: VariableInputEnum.switch,
            multiSelect: VariableInputEnum.multipleSelect
          }[String(variable.type)] ??
          (typeof variable.type === 'string' &&
          variableTypes.has(variable.type as VariableInputEnum)
            ? variable.type
            : VariableInputEnum.input);
        if (typeof variable.maxLength !== 'number' || variable.maxLength < 0) {
          // 负数或非数字长度没有有效含义，删除后使用当前默认约束。
          delete variable.maxLength;
        }
        if (typeof variable.enums === 'string') {
          // 旧版本可能把枚举数组序列化成 JSON 字符串；解析失败时删除脏值。
          try {
            variable.enums = JSON.parse(variable.enums);
          } catch {
            delete variable.enums;
          }
        }
        if (Array.isArray(variable.enums)) {
          // 枚举项缺少 label 时复用 value，保证选择控件有展示文本。
          variable.enums = variable.enums.map((item) =>
            isRecord(item) && item.label === undefined && typeof item.value === 'string'
              ? { ...item, label: item.value }
              : item
          );
        }
        return variable;
      });
  }
  return {
    nodes: normalizedNodes,
    // 只保留 source、target 及两侧 handle 均完整的边，过滤历史残缺边。
    edges: Array.isArray(edges)
      ? edges.filter(
          (edge) =>
            isRecord(edge) &&
            typeof edge.source === 'string' &&
            typeof edge.target === 'string' &&
            typeof edge.sourceHandle === 'string' &&
            typeof edge.targetHandle === 'string'
        )
      : [],
    chatConfig: normalizedChatConfig
  };
};

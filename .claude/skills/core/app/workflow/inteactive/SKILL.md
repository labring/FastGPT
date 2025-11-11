---
name: workflow-interactive-dev
description: 用于开发 FastGPT 工作流中的交互响应。详细说明了交互节点的架构、开发流程和需要修改的文件。
---

# 交互节点开发指南

## 概述

FastGPT 工作流支持多种交互节点类型,允许在工作流执行过程中暂停并等待用户输入。本指南详细说明了如何开发新的交互节点。

## 现有交互节点类型

当前系统支持以下交互节点类型:

1. **userSelect** - 用户选择节点(单选)
2. **formInput** - 表单输入节点(多字段表单)
3. **childrenInteractive** - 子工作流交互
4. **loopInteractive** - 循环交互
5. **paymentPause** - 欠费暂停交互

## 交互节点架构

### 核心类型定义

交互节点的类型定义位于 `packages/global/core/workflow/template/system/interactive/type.d.ts`

```typescript
// 基础交互结构
type InteractiveBasicType = {
  entryNodeIds: string[];                    // 入口节点ID列表
  memoryEdges: RuntimeEdgeItemType[];        // 需要记忆的边
  nodeOutputs: NodeOutputItemType[];         // 节点输出
  skipNodeQueue?: Array;                     // 跳过的节点队列
  usageId?: string;                          // 用量记录ID
};

// 具体交互节点类型
type YourInteractiveNode = InteractiveNodeType & {
  type: 'yourNodeType';
  params: {
    // 节点特定参数
  };
};
```

### 工作流执行机制

交互节点在工作流执行中的特殊处理(位于 `packages/service/core/workflow/dispatch/index.ts:1012-1019`):

```typescript
// 部分交互节点不会自动重置 isEntry 标志（因为需要根据 isEntry 字段来判断是首次进入还是流程进入）
runtimeNodes.forEach((item) => {
  if (
    item.flowNodeType !== FlowNodeTypeEnum.userSelect &&
    item.flowNodeType !== FlowNodeTypeEnum.formInput &&
    item.flowNodeType !== FlowNodeTypeEnum.agent
  ) {
    item.isEntry = false;
  }
});
```

## 开发新交互响应的步骤

### 步骤 1: 定义节点类型

**文件**: `packages/global/core/workflow/template/system/interactive/type.d.ts`

```typescript
export type YourInputItemType = {
  // 定义输入项的结构
  key: string;
  label: string;
  value: any;
  // ... 其他字段
};

type YourInteractiveNode = InteractiveNodeType & {
  type: 'yourNodeType';
  params: {
    description: string;
    yourInputField: YourInputItemType[];
    submitted?: boolean;  // 可选:是否已提交
  };
};

// 添加到联合类型
export type InteractiveNodeResponseType =
  | UserSelectInteractive
  | UserInputInteractive
  | YourInteractiveNode  // 新增
  | ChildrenInteractive
  | LoopInteractive
  | PaymentPauseInteractive;
```

### 步骤 2: 定义节点枚举（可选）

**文件**: `packages/global/core/workflow/node/constant.ts`

如果不需要添加新的节点类型，则不需要修改这个文件。

```typescript
export enum FlowNodeTypeEnum {
  // ... 现有类型
  yourNodeType = 'yourNodeType',  // 新增节点类型
}
```

### 步骤 3: 创建节点模板（可选）

**文件**: `packages/global/core/workflow/template/system/interactive/yourNode.ts`

```typescript
import { i18nT } from '../../../../../../web/i18n/utils';
import {
  FlowNodeTemplateTypeEnum,
  NodeInputKeyEnum,
  NodeOutputKeyEnum,
  WorkflowIOValueTypeEnum
} from '../../../constants';
import {
  FlowNodeInputTypeEnum,
  FlowNodeOutputTypeEnum,
  FlowNodeTypeEnum
} from '../../../node/constant';
import { type FlowNodeTemplateType } from '../../../type/node';

export const YourNode: FlowNodeTemplateType = {
  id: FlowNodeTypeEnum.yourNodeType,
  templateType: FlowNodeTemplateTypeEnum.interactive,
  flowNodeType: FlowNodeTypeEnum.yourNodeType,
  showSourceHandle: true,   // 是否显示源连接点
  showTargetHandle: true,   // 是否显示目标连接点
  avatar: 'core/workflow/template/yourNode',
  name: i18nT('app:workflow.your_node'),
  intro: i18nT('app:workflow.your_node_tip'),
  isTool: true,  // 标记为工具节点
  inputs: [
    {
      key: NodeInputKeyEnum.description,
      renderTypeList: [FlowNodeInputTypeEnum.textarea],
      valueType: WorkflowIOValueTypeEnum.string,
      label: i18nT('app:workflow.node_description'),
      placeholder: i18nT('app:workflow.your_node_placeholder')
    },
    {
      key: NodeInputKeyEnum.yourInputField,
      renderTypeList: [FlowNodeInputTypeEnum.custom],
      valueType: WorkflowIOValueTypeEnum.any,
      label: '',
      value: []  // 默认值
    }
  ],
  outputs: [
    {
      id: NodeOutputKeyEnum.yourResult,
      key: NodeOutputKeyEnum.yourResult,
      required: true,
      label: i18nT('workflow:your_result'),
      valueType: WorkflowIOValueTypeEnum.object,
      type: FlowNodeOutputTypeEnum.static
    }
  ]
};
```

### 步骤 4: 创建节点执行逻辑或在需要处理交互逻辑的节点上增加新逻辑

**文件**: `packages/service/core/workflow/dispatch/interactive/yourNode.ts`

```typescript
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import type {
  DispatchNodeResultType,
  ModuleDispatchProps
} from '@fastgpt/global/core/workflow/runtime/type';
import type { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { NodeOutputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import type { YourInputItemType } from '@fastgpt/global/core/workflow/template/system/interactive/type';
import { chatValue2RuntimePrompt } from '@fastgpt/global/core/chat/adapt';

type Props = ModuleDispatchProps<{
  [NodeInputKeyEnum.description]: string;
  [NodeInputKeyEnum.yourInputField]: YourInputItemType[];
}>;

type YourNodeResponse = DispatchNodeResultType<{
  [NodeOutputKeyEnum.yourResult]?: Record<string, any>;
}>;

export const dispatchYourNode = async (props: Props): Promise<YourNodeResponse> => {
  const {
    histories,
    node,
    params: { description, yourInputField },
    query,
    lastInteractive
  } = props;
  const { isEntry } = node;

  // 第一阶段:非入口节点或不是对应的交互类型,返回交互请求
  if (!isEntry || lastInteractive?.type !== 'yourNodeType') {
    return {
      [DispatchNodeResponseKeyEnum.interactive]: {
        type: 'yourNodeType',
        params: {
          description,
          yourInputField
        }
      }
    };
  }

  // 第二阶段:处理用户提交的数据
  node.isEntry = false;  // 重要:重置入口标志

  const { text } = chatValue2RuntimePrompt(query);
  const userInputVal = (() => {
    try {
      return JSON.parse(text);  // 根据实际格式解析
    } catch (error) {
      return {};
    }
  })();

  return {
    data: {
      [NodeOutputKeyEnum.yourResult]: userInputVal
    },
    // 移除当前交互的历史记录(最后2条)
    [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2),
    [DispatchNodeResponseKeyEnum.toolResponses]: userInputVal,
    [DispatchNodeResponseKeyEnum.nodeResponse]: {
      yourResult: userInputVal
    }
  };
};
```

### 步骤 5: 注册节点回调

**文件**: `packages/service/core/workflow/dispatch/constants.ts`

```typescript
import { dispatchYourNode } from './interactive/yourNode';

export const callbackMap: Record<FlowNodeTypeEnum, any> = {
  // ... 现有节点
  [FlowNodeTypeEnum.yourNodeType]: dispatchYourNode,
};
```

### 步骤 6: 创建前端渲染组件

#### 6.1 聊天界面交互组件

**文件**: `projects/app/src/components/core/chat/components/Interactive/InteractiveComponents.tsx`

```typescript
export const YourNodeComponent = React.memo(function YourNodeComponent({
  interactiveParams: { description, yourInputField, submitted },
  defaultValues = {},
  SubmitButton
}: {
  interactiveParams: YourInteractiveNode['params'];
  defaultValues?: Record<string, any>;
  SubmitButton: (e: { onSubmit: UseFormHandleSubmit<Record<string, any>> }) => React.JSX.Element;
}) {
  const { handleSubmit, control } = useForm({
    defaultValues
  });

  return (
    <Box>
      <DescriptionBox description={description} />
      <Flex flexDirection={'column'} gap={3}>
        {yourInputField.map((input) => (
          <Box key={input.key}>
            {/* 渲染你的输入组件 */}
            <Controller
              control={control}
              name={input.key}
              render={({ field: { onChange, value } }) => (
                <YourInputComponent
                  value={value}
                  onChange={onChange}
                  isDisabled={submitted}
                />
              )}
            />
          </Box>
        ))}
      </Flex>

      {!submitted && (
        <Flex justifyContent={'flex-end'} mt={4}>
          <SubmitButton onSubmit={handleSubmit} />
        </Flex>
      )}
    </Box>
  );
});
```

#### 6.2 工作流编辑器节点组件

**文件**: `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeYourNode.tsx`

```typescript
import React, { useMemo } from 'react';
import { type NodeProps } from 'reactflow';
import { Box, Button } from '@chakra-ui/react';
import NodeCard from './render/NodeCard';
import { type FlowNodeItemType } from '@fastgpt/global/core/workflow/type/node.d';
import Container from '../components/Container';
import RenderInput from './render/RenderInput';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';
import { useTranslation } from 'next-i18next';
import { type FlowNodeInputItemType } from '@fastgpt/global/core/workflow/type/io.d';
import { useContextSelector } from 'use-context-selector';
import IOTitle from '../components/IOTitle';
import RenderOutput from './render/RenderOutput';
import { WorkflowActionsContext } from '../../context/workflowActionsContext';

const NodeYourNode = ({ data, selected }: NodeProps<FlowNodeItemType>) => {
  const { t } = useTranslation();
  const { nodeId, inputs, outputs } = data;
  const onChangeNode = useContextSelector(WorkflowActionsContext, (v) => v.onChangeNode);

  const CustomComponent = useMemo(
    () => ({
      [NodeInputKeyEnum.yourInputField]: (v: FlowNodeInputItemType) => {
        // 自定义渲染逻辑
        return (
          <Box>
            {/* 你的自定义UI */}
          </Box>
        );
      }
    }),
    [nodeId, onChangeNode, t]
  );

  return (
    <NodeCard minW={'400px'} selected={selected} {...data}>
      <Container>
        <RenderInput nodeId={nodeId} flowInputList={inputs} CustomComponent={CustomComponent} />
      </Container>
      <Container>
        <IOTitle text={t('common:Output')} />
        <RenderOutput nodeId={nodeId} flowOutputList={outputs} />
      </Container>
    </NodeCard>
  );
};

export default React.memo(NodeYourNode);
```

### 步骤 7: 注册节点组件

需要在节点注册表中添加你的节点组件(具体位置根据项目配置而定)。

### 步骤 8: 添加国际化

**文件**: `packages/web/i18n/zh-CN/app.json` 和其他语言文件

```json
{
  "workflow": {
    "your_node": "你的节点名称",
    "your_node_tip": "节点功能说明",
    "your_node_placeholder": "提示文本"
  }
}
```

### 步骤9 调整保存对话记录逻辑

**文件**: `FastGPT/packages/service/core/chat/saveChat.ts`

修改 `updateInteractiveChat` 方法，支持新的交互

### 步骤10 根据历史记录获取/设置交互状态

**文件**: `FastGPT/projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts`
**文件**: `FastGPT/packages/global/core/workflow/runtime/utils.ts`

调整`setInteractiveResultToHistories`, `getInteractiveByHistories` 和 `getLastInteractiveValue`方法。

## 关键注意事项

### 1. isEntry 标志管理

交互节点需要保持 `isEntry` 标志在工作流恢复时有效:

```typescript
// 在 packages/service/core/workflow/dispatch/index.ts 中
// 确保你的节点类型被添加到白名单
if (
  item.flowNodeType !== FlowNodeTypeEnum.userSelect &&
  item.flowNodeType !== FlowNodeTypeEnum.formInput &&
  item.flowNodeType !== FlowNodeTypeEnum.yourNodeType  // 新增
) {
  item.isEntry = false;
}
```

### 2. 交互响应流程

交互节点有两个执行阶段:

1. **第一次执行**: 返回 `interactive` 响应,暂停工作流
2. **第二次执行**: 接收用户输入,继续工作流

```typescript
// 第一阶段
if (!isEntry || lastInteractive?.type !== 'yourNodeType') {
  return {
    [DispatchNodeResponseKeyEnum.interactive]: {
      type: 'yourNodeType',
      params: { /* ... */ }
    }
  };
}

// 第二阶段
node.isEntry = false;  // 重要!重置标志
// 处理用户输入...
```

### 3. 历史记录管理

交互节点需要正确处理历史记录:

```typescript
return {
  // 移除交互对话的历史记录(用户问题 + 系统响应)
  [DispatchNodeResponseKeyEnum.rewriteHistories]: histories.slice(0, -2),
  // ... 其他返回值
};
```

### 4. Skip 节点队列

交互节点触发时,系统会保存 `skipNodeQueue` 以便恢复时跳过已处理的节点。

### 5. 工具调用支持

如果节点需要在工具调用中使用,设置 `isTool: true`。

## 测试清单

开发完成后,请测试以下场景:

- [ ] 节点在工作流编辑器中正常显示
- [ ] 节点配置保存和加载正确
- [ ] 交互请求正确发送到前端
- [ ] 前端组件正确渲染交互界面
- [ ] 用户输入正确传回后端
- [ ] 工作流正确恢复并继续执行
- [ ] 历史记录正确更新
- [ ] 节点输出正确连接到后续节点
- [ ] 错误情况处理正确
- [ ] 多语言支持完整

## 参考实现

可以参考以下现有实现:

1. **简单单选**: `userSelect` 节点
   - 类型定义: `packages/global/core/workflow/template/system/interactive/type.d.ts:48-55`
   - 执行逻辑: `packages/service/core/workflow/dispatch/interactive/userSelect.ts`
   - 前端组件: `projects/app/src/components/core/chat/components/Interactive/InteractiveComponents.tsx:29-63`

2. **复杂表单**: `formInput` 节点
   - 类型定义: `packages/global/core/workflow/template/system/interactive/type.d.ts:57-82`
   - 执行逻辑: `packages/service/core/workflow/dispatch/interactive/formInput.ts`
   - 前端组件: `projects/app/src/components/core/chat/components/Interactive/InteractiveComponents.tsx:65-126`

## 常见问题

### Q: 交互节点执行了两次?
A: 这是正常的。第一次返回交互请求,第二次处理用户输入。确保在第二次执行时设置 `node.isEntry = false`。

### Q: 工作流恢复后没有继续执行?
A: 检查你的节点类型是否在 `isEntry` 白名单中(dispatch/index.ts:1013-1018)。

### Q: 用户输入格式不对?
A: 检查 `chatValue2RuntimePrompt` 的返回值,根据你的数据格式进行解析。

### Q: 如何支持多个交互节点串联?
A: 每个交互节点都会暂停工作流,用户完成后会自动继续到下一个节点。

## 文件清单总结

开发新交互节点需要修改/创建以下文件:

### 后端核心文件
1. `packages/global/core/workflow/template/system/interactive/type.d.ts` - 类型定义
2. `packages/global/core/workflow/node/constant.ts` - 节点枚举
3. `packages/global/core/workflow/template/system/interactive/yourNode.ts` - 节点模板
4. `packages/service/core/workflow/dispatch/interactive/yourNode.ts` - 执行逻辑
5. `packages/service/core/workflow/dispatch/constants.ts` - 回调注册
6. `packages/service/core/workflow/dispatch/index.ts` - isEntry 白名单

### 前端组件文件
7. `projects/app/src/components/core/chat/components/Interactive/InteractiveComponents.tsx` - 聊天交互组件
8. `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeYourNode.tsx` - 工作流编辑器组件

### 国际化文件
9. `packages/web/i18n/zh-CN/app.json` - 中文翻译
10. `packages/web/i18n/en/app.json` - 英文翻译
11. `packages/web/i18n/zh-Hant/app.json` - 繁体中文翻译

## 附录:关键输入输出键定义

如果需要新的输入输出键,在以下文件中定义:

**文件**: `packages/global/core/workflow/constants.ts`

```typescript
export enum NodeInputKeyEnum {
  // ... 现有键
  yourInputKey = 'yourInputKey',
}

export enum NodeOutputKeyEnum {
  // ... 现有键
  yourOutputKey = 'yourOutputKey',
}
```

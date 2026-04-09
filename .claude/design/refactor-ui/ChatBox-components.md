# ChatBox 组件梳理文档

> 路径：`projects/app/src/components/core/chat/ChatContainer/ChatBox/`
> 更新时间：2026-04-02
> 用途：样式重构前的组件全量梳理

---

## 目录结构

```
ChatBox/
├── index.tsx                              # 主容器组件
├── Provider.tsx                           # Context Provider
├── type.d.ts                              # TypeScript 类型定义
├── constants.ts                           # 常量定义
├── utils.ts                               # 工具函数
├── index.module.scss                      # 样式文件
├── hooks/
│   ├── useChatBox.tsx                    # 导出聊天功能 Hook
│   └── useFileUpload.tsx                 # 文件上传 Hook
├── Input/
│   ├── ChatInput.tsx                     # 输入框主组件
│   ├── InputGuideBox.tsx                 # 输入引导提示框
│   └── VoiceInput.tsx                    # 语音输入组件
└── components/
    ├── ChatItem.tsx                       # 聊天消息项
    ├── ChatController.tsx                 # 消息控制按钮组
    ├── ChatAvatar.tsx                     # 头像组件
    ├── WelcomeBox.tsx                     # 欢迎信息框
    ├── VariableInputForm.tsx              # 变量输入表单
    ├── FilesBox.tsx                       # 文件网格展示
    ├── FilesCascader.tsx                  # 文件级联选择器
    ├── FeedbackModal.tsx                  # 用户反馈弹框
    ├── SelectMarkCollection.tsx           # 管理员标记选择器
    ├── TimeBox.tsx                        # 消息时间间隔显示
    ├── QuoteList.tsx                      # 知识库引用列表
    ├── ResponseTags.tsx                   # 响应标签（引用/统计/上下文）
    ├── ContextModal.tsx                   # LLM 上下文预览弹框
    ├── EvaluationDatasetSelector.tsx      # 评测数据集选择器
    ├── home/
    │   ├── WelcomeHomeBox.tsx             # 首页欢迎框（Logo + 标语）
    │   ├── ChatHomeVariablesForm.tsx      # 首页变量表单
    │   └── QuickApps.tsx                  # 快速应用切换器
    └── assistant/
        ├── ChatHistory.tsx                # 助手模式聊天历史
        ├── ChatItem.tsx                   # 助手消息项
        └── ChatItemController.tsx         # 助手消息控制器
```

---

## 核心组件

### index.tsx — 主容器

**职责**：整个 ChatBox 的状态管理中心，协调消息流、文件上传、反馈等所有交互。

**Props**

```typescript
type Props = OutLinkChatAuthProps & ChatProviderProps & {
  isReady: boolean;
  feedbackType?: 'user' | 'admin' | 'hidden';
  showMarkIcon?: boolean;
  showVoiceIcon?: boolean;
  active?: boolean;
  showWorkorder?: boolean;
  onStartChat?: (e: StartChatFnProps) => Promise<StreamResponseType>;
  onTriggerRefresh?: () => void;
};
```

**核心方法**

| 方法 | 说明 |
|------|------|
| `generatingMessage()` | 处理流式消息（文本/工具调用/推理过程） |
| `sendPrompt()` | 发送消息并处理响应完整流程 |
| `retryInput()` | 重试上一次输入 |
| `delOneMessage()` | 删除单条消息对 |
| `onMark()` | 管理员标记数据 |
| `onAddUserLike/Dislike()` | 用户反馈（赞/踩） |

**消息发送流程**

```
用户输入 → ChatInput.handleSend()
  ↓
sendPrompt() [index.tsx]
  ↓
变量验证 & 格式化
  ↓
创建 Human + AI 消息项（乐观更新）
  ↓
调用 onStartChat (流式 API)
  ↓
generatingMessage() 逐块更新 UI
  ↓
生成问题引导 / 处理反馈
```

---

### Provider.tsx — Context Provider

**职责**：提供聊天环境所需的全局配置和音频能力。

**提供的 Context（`ChatBoxContext`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `welcomeText` | `string` | 欢迎文本 |
| `variableList` | `VariableItemType[]` | 变量列表 |
| `questionGuide` | `AppQGConfigType` | 问题引导配置 |
| `ttsConfig` | `AppTTSConfigType` | TTS 配置 |
| `whisperConfig` | `AppWhisperConfigType` | 语音识别配置 |
| `autoTTSResponse` | `boolean` | 是否自动语音播放 |
| `isChatting` | `boolean` | 是否正在生成 |
| `fileSelectConfig` | `AppFileSelectConfigType` | 文件选择配置 |
| `isAssistantType` | `boolean` | 是否为助手类型 |
| `audioLoading/Playing/hasAudio` | `boolean` | 音频状态 |
| `playAudioByText()` | `fn` | 文本转语音播放 |
| `startSegmentedAudio()` | `fn` | 开始分段音频 |
| `splitText2Audio()` | `fn` | 分段文本转音频 |
| `finishSegmentedAudio()` | `fn` | 完成分段音频 |
| `cancelAudio()` | `fn` | 取消音频播放 |
| `getHistoryResponseData()` | `fn` | 获取历史响应数据 |

---

## 输入区组件

### Input/ChatInput.tsx — 输入框

**职责**：统一的消息输入入口，支持文字、文件、语音三种方式。

**Props**

```typescript
{
  onSendMessage: SendPromptFnType;
  onStop: () => void;
  TextareaDom: React.MutableRefObject<HTMLTextAreaElement | null>;
  resetInputVal: (val: ChatBoxInputType) => void;
  chatForm: UseFormReturn<ChatBoxInputFormType>;
}
```

**功能列表**

| 功能 | 说明 |
|------|------|
| 自动高度调整 | Textarea 随内容增长 |
| 文件拖放上传 | 拖入文件触发上传流程 |
| 粘贴上传 | Paste 事件捕获图片/文档 |
| 键盘快捷键 | Enter 发送，Shift+Enter 换行 |
| 语音输入 | 集成 `VoiceInput` 组件 |
| 输入引导 | 集成 `InputGuideBox` 组件 |
| 文件预览 | 上传后的文件缩略图展示 |
| 发送/停止按钮 | 根据 `isChatting` 状态切换 |

---

### Input/VoiceInput.tsx — 语音输入

**职责**：处理 PC 和移动端的语音录入，通过 Whisper API 转文字。

**暴露的 Ref 接口**

```typescript
export interface VoiceInputComponentRef {
  onSpeak: () => void;
  getVoiceInputState: () => { isSpeaking: boolean; isTransCription: boolean };
}
```

**PC 模式**：波形可视化（Canvas）+ 录音时长 + 取消/完成按钮

**移动模式**：长按录音，上滑取消，松开发送

---

### Input/InputGuideBox.tsx — 输入引导

**职责**：根据输入内容展示候选提示词，点击直接填充输入框。

---

## 消息展示组件

### components/ChatItem.tsx — 消息项

**职责**：渲染单条聊天消息，分 Human 和 AI 两种形态。

**Props（核心字段）**

```typescript
{
  avatar?: string;
  type: ChatRoleEnum.Human | ChatRoleEnum.AI;
  chat: ChatSiteItemType;
  statusBoxData?: { status: string; name: string };
  questionGuides?: string[];
  showVoiceIcon?: boolean;
  onRetry?: () => void;
  onDelete?: () => void;
  onMark?: () => void;
  onAddUserLike?: () => void;
  onAddUserDislike?: () => void;
  onReadFeedback?: () => void;
  onCloseCustomFeedback?: () => void;
}
```

**包含子组件**

| 子组件 | 说明 |
|--------|------|
| `HumanContentCard` | 用户消息气泡 |
| `AIContentCard` | AI 消息气泡（含 Markdown 渲染） |
| `ChatController` | 复制/语音/重试/反馈等操作按钮 |
| `ResponseTags` | 引用/工具调用/上下文入口 |
| `FilesBlock` | 消息附带的文件/图片展示 |

---

### components/ChatController.tsx — 消息控制器

**职责**：每条消息下方的交互操作按钮组。

**按钮列表**

| 按钮 | 条件 | 说明 |
|------|------|------|
| 复制 | 始终 | 复制纯文本内容 |
| 语音播放 | `showVoiceIcon` | TTS 朗读 |
| 重试 | AI 消息 | 重新生成 |
| 删除 | 始终 | 删除该消息对 |
| 赞 | `feedbackType=user` | 正向反馈 |
| 踩 | `feedbackType=user` | 负向反馈，触发 FeedbackModal |
| 标记 | `feedbackType=admin` | 管理员数据标记 |
| 反馈已读 | 有未读反馈 | 标记反馈为已读 |
| 关闭自定义反馈 | 有自定义反馈 | 关闭当前反馈 |

---

### components/ChatAvatar.tsx — 头像

**职责**：显示用户或 AI 的头像，支持自定义图片和默认图标。

---

### components/ResponseTags.tsx — 响应标签

**职责**：AI 回复下方的辅助信息入口标签。

**导出类型**

```typescript
export type CitationRenderItem = {
  type: 'dataset' | 'link';
  key: string;
  displayText: string;
  icon?: string;
  onClick: () => any;
};
```

**功能入口**

| 标签 | 说明 |
|------|------|
| 知识库引用 | 点击打开 `QuoteList` |
| 工具调用 | 显示调用链路 |
| 上下文预览 | 点击打开 `ContextModal` |
| 完整响应 | 查看详细响应数据 |
| 助手详情 | 助手模式下的详情展示 |

---

### components/QuoteList.tsx — 引用列表

**职责**：展示知识库引用的具体片段内容，支持查看源文件和跳转数据集。

---

### components/ContextModal.tsx — 上下文预览

**职责**：弹框展示 LLM 实际接收到的对话历史（system prompt + messages），便于调试。

---

### components/TimeBox.tsx — 时间间隔

**职责**：相邻消息时间差超过 10 分钟时，在消息间显示时间分割线。

---

### components/WelcomeBox.tsx — 欢迎信息框

**职责**：对话开始前展示应用配置的欢迎语文本（支持 Markdown）。

---

### components/VariableInputForm.tsx — 变量输入表单

**职责**：渲染应用定义的输入变量，在发送第一条消息前收集用户填写的变量值。

**支持的变量类型**

| 类型 | 说明 |
|------|------|
| External | 外部自定义变量（Log/Test 模式显示） |
| Internal | 内置变量（Test 模式显示） |
| Common | 常规变量（始终显示） |

---

### components/FilesBox.tsx — 文件展示框

**职责**：网格布局展示消息中携带的文件或图片。

**布局规则**：文件数 1 → 1 列，2 → 2 列，≥3 → 3 列

---

### components/FilesCascader.tsx — 文件级联选择器

**职责**：选择上传文件的目标知识库层级路径。

---

### components/FeedbackModal.tsx — 反馈弹框

**职责**：用户点踩后弹出文本框，收集具体反馈内容并提交。

**流程**：点击踩 → 打开弹框 → 填写反馈 → 调用 API → 更新 UI 状态

---

### components/SelectMarkCollection.tsx — 管理员标记选择器

**职责**：管理员标记对话数据用于训练数据集。

**关键类型**

```typescript
export type AdminMarkType = {
  feedbackDataId?: string;
  datasetId?: string;
  collectionId?: string;
  q: string;
  a?: string;
};
```

---

### components/EvaluationDatasetSelector.tsx — 评测数据集选择器

**职责**：选择用于保存评测数据的数据集。

---

## 首页组件（components/home/）

### WelcomeHomeBox.tsx — 首页欢迎框

**职责**：首页展示应用 Logo 和标语，响应式布局适配宽屏/窄屏。

---

### ChatHomeVariablesForm.tsx — 首页变量表单

**职责**：在首页展示变量填写表单 + 发送按钮，作为对话启动入口。

**变量分组**：
- 外部变量（External）
- 常规变量（Common）

---

### QuickApps.tsx — 快速应用切换器

**职责**：显示可快速切换的应用列表（头像 + 名称），当前激活项高亮。

---

## 助手模式组件（components/assistant/）

### ChatHistory.tsx — 助手聊天历史

**职责**：助手模式下的聊天历史渲染，支持纠错、自定义反馈和数据标记。

---

### ChatItem.tsx — 助手消息项

**职责**：助手模式专用消息项，集成纠错弹框和独立响应模态框。

---

### ChatItemController.tsx — 助手消息控制器

**职责**：助手消息的操作按钮，提供纠错、标签和状态等助手专有功能。

---

## Hooks

### hooks/useChatBox.tsx — 导出功能

**职责**：将当前对话内容导出为多种格式。

**支持格式**

| 格式 | 实现方式 |
|------|----------|
| Markdown | 格式化角色和消息内容拼接 |
| HTML | DOM 克隆 + HTML 模板 |
| PDF | html2pdf 库转换 |

---

### hooks/useFileUpload.tsx — 文件上传

**职责**：管理完整文件上传生命周期。

**上传流程**

```
选择/拖放文件
  ↓
文件类型 & 大小验证
  ↓
获取 S3 预签名 URL (API)
  ↓
并行上传到 S3（带进度回调）
  ↓
获取文件预览 URL
  ↓
updateFiles() 更新状态
```

**限制优先级**：文件配置 > 团队套餐限制 > 系统全局配置 > 默认值

---

## 上下文依赖

| Context | 主要消费组件 | 关键字段 |
|---------|-------------|----------|
| `ChatBoxContext` | Provider 提供，全局消费 | 欢迎文本、变量、音频配置、isChatting |
| `ChatRecordContext` | index, ChatItem, ChatHistory | chatRecords, setChatRecords |
| `ChatItemContext` | ChatItem, Header | chatBoxData.app, userAvatar, setCiteModalData |
| `WorkflowRuntimeContext` | index, ChatInput | appId, chatId, outLinkUid, shareId |

> 全部使用 `useContextSelector` 精细化订阅，避免无关更新触发重渲染。

---

## 组件树总览

```
ChatBox (index.tsx)
├── ChatProvider (Provider.tsx)
│   └── WorkflowRuntimeContextProvider
│
├── WelcomeBox                        # 欢迎文本
├── VariableInputForm                 # 变量输入
│
├── 消息列表（循环 chatRecords）
│   ├── TimeBox                       # 时间分割线
│   └── ChatItem                      # 每条消息
│       ├── ChatAvatar                # 头像
│       ├── HumanContentCard          # 用户消息气泡
│       │   └── FilesBlock            # 附件
│       ├── AIContentCard             # AI 消息气泡
│       │   └── Markdown              # Markdown 渲染
│       ├── ChatController            # 操作按钮
│       └── ResponseTags              # 引用/上下文标签
│           ├── QuoteList             # 引用详情（弹框）
│           └── ContextModal          # 上下文预览（弹框）
│
├── ChatInput                         # 输入框
│   ├── InputGuideBox                 # 输入提示
│   ├── VoiceInput                    # 语音输入
│   └── FilesBox                      # 文件预览
│
└── 弹框（动态加载）
    ├── FeedbackModal                 # 反馈弹框
    └── SelectMarkCollection          # 管理员标记选择器

首页模式额外组件：
├── WelcomeHomeBox                    # 首页欢迎框
├── ChatHomeVariablesForm             # 首页变量表单
└── QuickApps                         # 快速应用切换

助手模式替换组件：
└── ChatHistory                       # 替代常规消息列表
    └── assistant/ChatItem
        └── assistant/ChatItemController
```

---

## 外部依赖汇总

### UI 库
- `@chakra-ui/react` — 主要 UI 组件库
- `@fastgpt/web/components` — 共享基础组件（Avatar、MyIcon、MyMenu 等）

### 功能库
- `react-hook-form` — 表单状态管理
- `use-context-selector` — 精细化 Context 订阅
- `ahooks` — useMemoizedFn、useCreation 等
- `framer-motion` — 动画
- `dayjs` — 时间格式化
- `lodash` — 工具函数

### API 模块
| 模块 | 用途 |
|------|------|
| `@/web/core/chat/api` | 聊天核心 API |
| `@/web/core/chat/feedback/api` | 反馈提交 API |
| `@/web/core/ai/api` | TTS / Whisper API |
| `@/web/core/dataset/api` | 知识库引用 API |
| `@/web/common/file/api` | 文件上传 API |

### 样式
- `index.module.scss` — 模块化 CSS，定义消息气泡、滚动区等核心样式
- Chakra UI 主题 token — 颜色、间距、圆角等设计变量

---

## 性能优化措施

| 手段 | 应用位置 |
|------|----------|
| `next/dynamic` 动态导入 | FeedbackModal、SelectMarkCollection 等弹框 |
| `React.memo` | ChatItem、ChatController、ResponseTags |
| `useContextSelector` | 所有 Context 消费组件 |
| `useMemoizedFn` | 所有传入子组件的回调函数 |
| `useCreation` | 避免初始化重复创建 |

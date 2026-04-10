# 硬编码颜色审计报告

> 生成时间：2026-04-03  
> 分析范围：当前暂存区（git staged）中的所有 `.tsx` 文件

---

## 一、总览

| 指标 | 数量 |
|------|------|
| 涉及文件数 | 17 |
| 硬编码颜色总处 | 68 |
| 十六进制颜色（#xxx） | 51 |
| rgba/rgb 函数颜色 | 12 |
| CSS 原生字符串（white 等） | 3 |
| Chakra UI 主题 token（非项目自定义） | 2 |

---

## 二、逐文件清单

### 1. `packages/web/components/common/Tag/index.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 64 | `#EECFF6` | borderColor | 紫色标签边框 |
| 65 | `#F6EEFA` | bg | 紫色标签背景 |
| 66 | `#A558C9` | color | 紫色标签文字 |
| 69 | `#D3CAFF` | borderColor | 蓝紫色标签边框 |
| 70 | `#F0EEFF` | bg | 蓝紫色标签背景 |
| 71 | `#6F5DD7` | color | 蓝紫色标签文字 |
| 79 | `#FFE0EC` | borderColor | 粉红色标签边框 |
| 80 | `#FFF1F6` | bg | 粉红色标签背景 |
| 81 | `#E82F72` | color | 粉红色标签文字 |
| 84 | `#B3D4FF` | borderColor | 蓝色标签边框 |
| 85 | `rgba(230, 241, 255, 0.6)` | bg | 蓝色标签背景 |
| 86 | `#1770E6` | color | 蓝色标签文字 |

---

### 2. `projects/app/src/components/SideBar/index.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 58 | `#F0F2F5` | bg | 侧边栏背景 |
| 75 | `#485264` | color | 侧边栏文字 |

---

### 3. `projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/ChatInput.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 181 | `#707070` | color | placeholder 文字颜色 |
| 302 | `rgba(0, 0, 0, 0.04)` | bg (_hover) | 按钮悬停背景 |
| 309 | `#707070` | color | 图标颜色 |
| 325 | `rgba(0, 0, 0, 0.04)` | bg (_hover) | 按钮悬停背景 |
| 332 | `#707070` | color | 图标颜色 |
| 400 | `rgba(0, 65, 178, 0.12)` | boxShadow | 输入框聚焦阴影 |
| 402 | `#E1E5EB` | border | 输入框边框 |
| 441 | `#FFFFFF` | bg | 输入框背景 |
| 448 | `#E1E5EB` | border | 输入框边框（非聚焦） |
| 450 | `rgba(0, 65, 178, 0.06)` | boxShadow | 输入框默认阴影 |

---

### 4. `projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/InputGuideBox.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 53 | `#FFFFFF` | bg | 引导框背景 |
| 55 | `#EBEDF0` | border | 引导框边框 |
| 56 | `rgba(19, 51, 107, 0.1)` | boxShadow | 引导框阴影（双阴影） |
| 76 | `#333333` | color | 引导项文字颜色 |
| 78 | `rgba(50, 136, 250, 0.06)` | bg | 引导项悬停背景 |
| 86 | `#1770E6` | color | 高亮文字颜色 |

---

### 5. `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 161 | `primary.100` | bg | 用户消息气泡背景（Chakra token） |
| 168 | `myGray.50` | bg | AI 消息气泡背景（Chakra token） |
| 464 | `white` | bg | 操作区背景 |

---

### 6. `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/SfChatController.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 37 | `#637A99` | color | 控制器按钮文字 |
| 41 | `#637A99` | color | 控制器按钮文字（重复） |

---

### 7. `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/SfChatItem.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 82 | `#F7F8FA` | bg | 消息气泡背景 |
| 87 | `#596A80` | color | 消息文字颜色 |
| 176 | `#E6F1FF` | bg | 选中/高亮消息背景 |

---

### 8. `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/WelcomeBox.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 10 | `white` | bg | 欢迎框背景 |

---

### 9. `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/assistant/ChatItem.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 89 | `#24282C` | color | 消息主文字 |
| 100 | `#485264` | color | 次级文字 |
| 111 | `#EBEDF0` | borderColor | 分隔线/边框 |
| 112 | `#999999` | color | 辅助文字（灰色） |
| 119 | `#333` | color | 文字颜色 |
| 126 | `#485164` | color | 次级文字（注意：与 #485264 相近，疑似笔误） |
| 134 | `#FAFBFC` | background | 内容区背景 |
| 158 | `#909499` | color | 时间戳/meta 文字 |
| 159 | `#F0F2F5` | background | 元信息区背景 |
| 168 | `#156AD9` | color | 链接/强调色 |
| 249 | `primary.600` | bg | 气泡背景（Chakra token） |
| 421 | `#CCCCCC` | color | 禁用/占位文字 |

---

### 10. `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 1425 | `rgba(50, 170, 255, 0.6)` 等多个 | borderImage | conic-gradient 流光边框（多色） |
| 1426 | `rgba(0, 78, 212, 0.06)` | boxShadow | 容器阴影 |
| 1428 | `rgba(240, 246, 255, 0.4)` 等 | background | linear-gradient 背景（多色） |

---

### 11. `projects/app/src/components/core/chat/components/AIResponseBox.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 44 | `white` | bg | 响应框背景 |
| 109 | `white` | bg | 响应框背景（重复） |

---

### 12. `projects/app/src/pageComponents/chat/ChatHeader.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 70 | `#FBFDFF` | bg | Header 背景（近白） |
| 307 | `#333333` | color | Header 标题文字 |

---

### 13. `projects/app/src/pageComponents/chat/slider/ChatSliderList.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 94 | `#E6F6F6` | bg | 置顶会话高亮背景 |
| 110 | `#3E4A59` | color | 会话列表文字 |

---

### 14. `projects/app/src/pageComponents/chat/slider/ChatSliderMenu.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 40 | `#3E4A59` | color | 菜单文字颜色 |

---

### 15. `projects/app/src/pageComponents/chat/slider/ChatSliderSidebar.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 21 | `#E6F1FF` | borderColor | 侧边栏边框颜色 |

---

### 16. `projects/app/src/pageComponents/chat/slider/index.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 230 | `primary.1` | bg | 侧边栏背景（非标准 token） |
| 237 | `primary.1` | bg | 侧边栏背景（非标准 token） |
| 526 | `primary.1` | bg | 侧边栏背景（非标准 token） |

---

### 17. `projects/app/src/pages/chat/index.tsx`

| 行号 | 颜色值 | 属性 | 说明 |
|------|--------|------|------|
| 43 | `linear-gradient(180deg, #F2F8FF 0%, #F5F8FC 10%)` | background | 页面渐变背景 |

---

## 三、重复颜色归组（建议提取为 Token）

| 颜色值 | 出现文件 & 行号 | 语义建议 |
|--------|----------------|---------|
| `#F0F2F5` | SideBar:58, assistant/ChatItem:159 | `chatBg` / `sidebarBg` |
| `#485264` | SideBar:75, assistant/ChatItem:100 | `textSecondary` |
| `#485164` | assistant/ChatItem:126 | 疑似 `#485264` 笔误，需确认 |
| `#707070` | ChatInput:181, 309, 332 | `textPlaceholder` / `iconMuted` |
| `#E1E5EB` | ChatInput:402, 448 | `borderDefault` |
| `rgba(0, 65, 178, 0.12)` | ChatInput:400 | `shadowFocused` |
| `rgba(0, 65, 178, 0.06)` | ChatInput:450 | `shadowDefault` |
| `#FFFFFF` / `white` | ChatInput:441, InputGuideBox:53, WelcomeBox:10, AIResponseBox:44/109 | `bgWhite` |
| `#1770E6` | Tag:86, InputGuideBox:86 | `primary` / `linkColor` |
| `#333333` / `#333` | InputGuideBox:76, assistant/ChatItem:119, ChatHeader:307 | `textPrimary` |
| `#EBEDF0` | InputGuideBox:55, assistant/ChatItem:111 | `borderLight` |
| `#3E4A59` | ChatSliderList:110, ChatSliderMenu:40 | `textSlider` |
| `#E6F1FF` | SfChatItem:176, ChatSliderSidebar:21 | `primaryLight` / `selectionBg` |
| `#637A99` | SfChatController:37, 41 | `textMuted` |

---

## 四、需重点关注的问题

1. **疑似笔误**：`assistant/ChatItem.tsx:126` 使用 `#485164`，与 `#485264`（其他处）仅第 5 位不同，需确认是否为笔误。

2. **`primary.1` 非标准 Token**：`slider/index.tsx` 多处使用 `primary.1`，需确认该 token 是否在主题中已定义（`packages/web/styles/theme.ts`）。

3. **渐变/复杂 CSS**：`ChatBox/index.tsx:1425` 的 conic-gradient 流光效果和 `chat/index.tsx:43` 的 linear-gradient 包含多个硬编码色值，建议封装为 CSS 变量或主题常量。

4. **Tag 组件颜色系统**：`Tag/index.tsx` 定义了完整的多色标签体系（紫/蓝紫/粉/蓝），建议统一提取为 `tagColors` 配置对象。

---

## 五、建议的修改方向

### 方案 A：扩展 Chakra UI 主题（推荐）
在 `packages/web/styles/theme.ts` 中扩展 `colors` 配置，将业务语义颜色作为自定义 token 注册：

```ts
colors: {
  // 文字
  textPrimary: '#333333',
  textSecondary: '#485264',
  textMuted: '#637A99',
  textPlaceholder: '#707070',

  // 边框
  borderDefault: '#E1E5EB',
  borderLight: '#EBEDF0',

  // 背景
  chatBg: '#F0F2F5',
  chatBgWhite: '#FFFFFF',
  chatBgFaint: '#FAFBFC',

  // 主色衍生
  primaryLight: '#E6F1FF',
  primaryLink: '#1770E6',
  primaryFocus: '#156AD9',
}
```

### 方案 B：CSS 变量
对于渐变、阴影等复杂值，可提取为 CSS 变量放入全局样式文件。

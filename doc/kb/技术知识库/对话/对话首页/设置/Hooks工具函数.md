---
capability_label: "设置"
doc_type: "16"
doc_label: "Hooks工具函数"
generated_at: "2026-06-18T10:10:00Z"
parent_module: "对话首页"
roles: ["管理员"]
router_paths: ["/chat?pane=s"]
---

# 设置 — Hooks工具函数

## Hooks

### `useImageUpload`

- **位置**: `pageComponents/chat/ChatSetting/ImageUpload/hooks/useImageUpload.tsx`
- **签名**: `function useImageUpload({ maxSize, onFileSelect }: { maxSize?: number, onFileSelect: (url: string) => void }): ImageUploadReturn`
- **用途**: 封装图片上传的完整交互逻辑，包括文件选择、拖拽处理、上传状态管理和进度反馈
- **返回值**: `{ SelectFileComponent, onOpenSelectFile, onSelectFile, isDragging, handleDragEnter, handleDragLeave, handleDragOver, handleDrop, loading }`
- **是否对外共享**: 否（仅在 `ImageUpload/index.tsx` 组件内使用）

## 常量

| 文件 | 导出项 | 类型 | 说明 |
|------|--------|------|------|
| `pageComponents/chat/constants.ts` | `ChatSettingTabOptionEnum` | Enum | 设置页 4 个 Tab 的枚举值：HOME=`h`, DATA_DASHBOARD=`d`, LOG_DETAILS=`l`, FAVOURITE_APPS=`f` |
| `pageComponents/chat/constants.ts` | `ChatSidebarPaneEnum` | Enum | 侧边栏面板枚举，含 SETTING=`s` |
| `pageComponents/chat/constants.ts` | `DEFAULT_LOGO_BANNER_URL` | String | 默认宽 Logo 地址 |
| `pageComponents/chat/constants.ts` | `DEFAULT_LOGO_BANNER_COLLAPSED_URL` | String | 默认折叠 Logo 地址 |

> 常量完整值见源码 `projects/app/src/pageComponents/chat/constants.ts`。

## 函数依赖关系

- `ImageUpload` 组件依赖 `useImageUpload` hook（处理文件选择和上传逻辑）
- `useImageUpload` 无其他 hook 依赖，为独立 hook

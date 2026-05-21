## 背景

在 AI 回答的流式传输过程中，如果 AI 返回了图片（Markdown 图片语法 `![](url)`），尚未完成输出时，图片会不断闪烁。

## 根因链

```
每个 streaming token
    │
    ▼
source 变化
    │
    ▼
citeIndexMap = new Map()      ← source 变就重建
    │
    ▼
useCreation deps 变了
    │
    ▼
components 对象重建
    │
    ▼
components.img = 新箭头函数    ← img 不依赖 citeIndexMap，但被连带重建
    │
    ▼
ReactMarkdown: createElement 的 type 变了
    │
    ▼
React: unmount 旧 Image → mount 新 Image
    │
    ▼
MdImage: isLoaded 重置为 false → Skeleton 出现 → 闪烁
```

## 方案

### 修复 A（治根）：拆离 img 渲染器

将 `components.img` 从大的 `useCreation` 拆出，只依赖 `chatAuthData`（流式期间稳定）：

```tsx
const imgComponent = useCreation(() => {
  return (props: any) => <Image {...props} chatAuthData={chatAuthData} />;
}, [chatAuthData]); // ← 全程不变 → img 引用稳定
```

`a` 等其他渲染器依赖 `citeIndexMap`，留在原 `useCreation` 中。互不影响。

### 修复 B（防御）：图片加载状态缓存

`MdImage` 中维护 `useRef<Set<string>>` 作为已加载 src 的缓存，即使 Image 因其他原因 remount，也能直接从缓存判断加载状态，跳过 Skeleton。

## 非目标

- 不改变 ReactMarkdown 的解析逻辑
- 不改变图片显示样式或交互行为
- 不涉及非流式场景的渲染逻辑
- 不涉及其他 Markdown 渲染器（a、code、table 等）

## 预期效果

流式输出过程中：
- Image 组件在首个 token 到达后稳定挂载
- 后续 token 到来时不 unmount/mount
- isLoaded 维持 true → Skeleton 始终隐藏
- 用户看不到任何闪烁

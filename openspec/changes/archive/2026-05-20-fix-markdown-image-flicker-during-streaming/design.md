# Markdown 图片闪烁问题修复设计

## 现状

`projects/app/src/components/Markdown/index.tsx` 中：

### 问题 1：img 渲染器被连带重建

```tsx
// 第 89-108 行
const components = useCreation(() => {
  return {
    img: (props: any) => <Image {...props} alt={props.alt} chatAuthData={chatAuthData} />,
    //          ↑ 这是一个箭头函数，被 useCreation 创建
    //            当 useCreation deps 改变时，这个函数是新引用
    pre: RewritePre,
    code: Code,
    table: MarkdownTable as any,
    a: (props: any) => <A ... />
  };
}, [chatAuthData, onOpenCiteModal, showAnimation, citeStyle, citeIndexMap, citeSourceMap]);
//  ↑ citeIndexMap 随 source 变化的每个 token 刷新
//  ↑ img 标签根本不依赖 citeIndexMap，但被迫随着重建
```

### 问题 2：citeIndexMap 每次 source 变化都返回新 Map

```tsx
// 第 65-87 行
const citeIndexMap = useMemo(() => {
  if (citeStyle !== 'index') return undefined;
  const map = new Map<string, number>();
  // ... 填充 map ...
  return map;  // ← 每次都是新 Map 引用
}, [citeStyle, source, citeSourceMap]);
//  ↑ source 随 streaming token 频繁变化
```

### 问题 3：MdImage 无加载缓存

```tsx
// img/Image.tsx:13
const [isLoaded, { setTrue }] = useBoolean(false);
// 只要组件 remount，isLoaded 回退到 false → Skeleton 闪烁
```

## 修复设计

### 修复 A：拆离 img 渲染器（治根）

将 img 组件从 `useCreation` 依赖链中解耦，使用独立的 `useCreation`：

```tsx
const imgComponent = useCreation(() => {
  return (props: any) => <Image {...props} alt={props.alt} chatAuthData={chatAuthData} />;
}, [chatAuthData]);

const components = useCreation(() => {
  return {
    img: imgComponent, // ← 使用独立的稳定引用
    pre: RewritePre,
    code: Code,
    table: MarkdownTable as any,
    a: (props: any) => <A ... />
  };
}, [chatAuthData, onOpenCiteModal, showAnimation, citeStyle, citeIndexMap, citeSourceMap]);
```

效果：
- `imgComponent` 只在 `chatAuthData` 变化时重建（流式期间稳定）
- `components` 仍按原有 deps 变化，但 `components.img` 指向同一函数
- ReactMarkdown 的 `createElement(components.img, ...)` 的 type 保持不变
- React 不会 unmount Image → MdImage state 保持 → 不闪烁

### 修复 B：图片加载状态缓存（防御层）

在 `MdImage` 模块级别（组件外部）维护 `Set<string>` 作为已加载 src 的全局缓存：

```tsx
const loadedSrcSet = new Set<string>();

function MdImage({ src, ...props }) {
  const isInitiallyLoaded = src ? loadedSrcSet.has(src) : false;
  const [isLoaded, { setTrue }] = useBoolean(isInitiallyLoaded);
  const [renderSrc, setRenderSrc] = useState(src);

  // 图片加载成功后缓存
  // ...
}
```

**为什么是模块级而非 useRef？**

`useRef` 放在 `MdImage` 内部无法实现跨实例缓存——每个 MdImage 有独立的 ref，组件 remount 后 ref 也是新的，缓存失效。模块级 Set 是唯一能实现跨实例共享缓存的方式。

效果：即使未来有其他依赖变化导致 Image 被 remount，只要 `src` 之前已加载过，`isLoaded` 初始化为 `true`，不会显示 Skeleton。

## 修改范围

### 文件 1：`projects/app/src/components/Markdown/index.tsx`

- 将 `Image` 函数（第 192-194 行）改为使用稳定的组件引用
- 新增独立的 `imgComponent` 的 `useCreation`
- `components` 中的 `img` 字段指向 `imgComponent`

### 文件 2：`projects/app/src/components/Markdown/img/Image.tsx`

- 新增 `loadedSrcSet` 缓存（`useRef<Set<string>>`）
- `isLoaded` 初始值依赖缓存检查
- `onLoad` 回调中缓存已加载的 src

## 风险

- **低风险**：纯组件拆离，无业务逻辑变更
- **缓存不过期**：`loadedSrcSet` 为模块级，在页面生命周期内持续累积已加载的图片 URL。普通 URL 字符串占用可忽略；base64 图片 URL 理论上有一定内存占用，但实际场景中极少出现。如需优化，可考虑设置 Set 容量上限，但现阶段不必要

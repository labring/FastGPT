# 任务列表

## TODO

- [x] **Task 1**：`index.tsx` — 新增 `imgComponent` useCreation，deps 仅含 `chatAuthData`
  - 文件：`projects/app/src/components/Markdown/index.tsx`
  - 在 `const components = useCreation(...)` 之前添加：
    ```tsx
    const imgComponent = useCreation(
      () => (props: any) => <Image {...props} alt={props.alt} chatAuthData={chatAuthData} />,
      [chatAuthData]
    );
    ```
  - 将 `components` 中的 `img` 替换为 `img: imgComponent`
  - 移除原来 `img` 行的内联箭头函数

- [x] **Task 2**：`img/Image.tsx` — 增加图片加载状态缓存
  - 文件：`projects/app/src/components/Markdown/img/Image.tsx`
  - 在模块级别（组件外部）声明 `const loadedSrcSet = new Set<string>()`
  - `useBoolean` 初始值改为 `src ? loadedSrcSet.has(src) : false`
  - `onLoad` 回调中 `loadedSrcSet.add(src)`

- [x] **Task 3**：验证
  - 流式输出期间，图片出现后不再闪烁
  - 普通（非流式）场景，图片正常加载 Skeleton → 显示

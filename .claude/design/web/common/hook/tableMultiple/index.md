# 背景

一个通用表格多选 hook/component, 它可以实现表格每一行数据的选择，并且在触发一次选择后，会有特殊的按键进行批量操作。

# 具体描述

当有一行被选中时，底部会出现悬浮层，可以进行批量操作（具体有哪些批量操作由外部决定）

![alt text](./image-1.png)

# 预期封装

1. 选中的值存储在 hook 里，便于判断是否触发底部悬浮层
2. 悬浮层外层 Box 在 hook 里，child 由调用组件实现
3. FastGPT/packages/web/hooks/useTableMultipleSelect.tsx 在这个文件下实现
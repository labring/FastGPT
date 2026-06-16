# 判断器回连交互节点第二次不渲染问题分析

## 背景

用户提供的工作流 `/Users/yjl/Downloads/子循环 (1).json` 通过判断器分支回连，再次进入同一个 `formInput` 节点。第一次表单可以渲染，提交后回连再次触发表单时，第二个表单不渲染。

## 根因

前端恢复流去重逻辑曾用 `entryNodeIds` 判断两个 interactive 是否为同一轮交互：

- 普通流程中，同一个 `entryNodeIds` 通常可以近似表示同一个暂停点。
- 判断器回连、循环、递归路径中，同一个节点会多次触发，`entryNodeIds` 只能说明“哪个节点”，不能说明“第几次触发”。

因此，当第一轮表单已经 `submitted=true` 后，第二轮同节点表单由于 `entryNodeIds` 相同，可能被误判为上一轮的 stale replay，并被跳过追加，导致前端没有进入待交互渲染态。

该问题与 2026-05-15 的 `fix: skip stale resume interactive after submitted form` 类修复有关。该修复用于防止恢复流 replay 的空表单覆盖已提交表单值，但同节点回连场景暴露了 `entryNodeIds` 作为交互身份不够精确的问题。

## 修复方案

新增 `interactiveId` 作为每次交互暂停的唯一触发轮次 ID：

1. 服务端每次生成 workflow interactive 时写入新的 `interactiveId`。
2. 前端判断同一交互时，若任一侧存在 `interactiveId`，优先按 `interactiveId` 判断。
3. 只有双方都没有 `interactiveId` 的旧数据，才回退到原来的 `usageId/entryNodeIds` 兼容逻辑。

这样同一个 `formInput` 节点多次触发时会有不同的 `interactiveId`，第二轮表单可以正常 append 和渲染；恢复流中同一轮 stale replay 仍会被拦截。


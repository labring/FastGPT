# ChatBox 上传 Abort 设计

## 0. 文档标识

- 任务前缀：`s3-refactor-chatbox-abort`
- 文档文件名：`chatbox-upload-abort.md`
- 更新时间：2026-07-09
- 推荐 PR：PR 3
- 优先级：P2
- 当前结论：可以实施，但必须同时解决“请求取消”和“异步结果写回竞态”，不能只给 PUT 加 `AbortController`。

## 1. 需求背景

ChatBox 输入框上传文件时，会先出现文件图标和上传 loading 占位。现在 hover 后点击关闭按钮，前端 field array 会移除该占位，但底层预签名请求或 S3 上传请求仍可能继续执行。

如果异步请求后续完成，当前代码仍可能调用 `updateFiles(fileIndex, copyFile)`，把已经移除的文件重新写回上传列表。

## 2. 核心判断

这个问题不是单纯缺少 `AbortController`，而是三个竞态叠加：

1. UI 删除只调用 `removeFiles(index)`，没有取消预签名请求和 PUT 请求。
2. `uploadFiles` 中提前计算 `fileIndex`，后续进度和成功回调继续用旧 index 写回。
3. `FilePreview` 渲染的是排序后的 `fileList`，删除按钮传出的 index 不一定等于 react-hook-form 原始 field array index。

所以 PR3 的正确设计应该是：

1. 每个本地上传文件有稳定 `uploadId`。
2. 请求层支持 `AbortSignal`。
3. 所有异步写回都按 `uploadId` 重新查当前 field array。
4. 文件已被删除、任务已取消、组件已卸载时，不写回、不 toast。

## 3. 目标

1. 用户点击关闭按钮后，真正 abort 正在进行的预签名请求或上传请求。
2. 已取消文件不会被进度回调、成功回调或失败回调重新写回。
3. 删除文件时使用稳定 `uploadId`，不依赖 UI 排序后的 index。
4. 用户主动取消不展示上传失败 toast。
5. 主输入框 `ChatInput` 和用户消息编辑态 `HumanChatBubble/EditForm` 行为一致。

## 4. 非目标

1. 不改 S3 短链协议。
2. 不改服务端文件类型校验。
3. 不重构整个 ChatBox 表单。
4. 不改变消息发送协议。
5. 不给前端新增对象删除 API；取消后的孤儿对象清理由现有 S3 TTL 机制处理。
6. 不处理 `FileSelector` 组件。它有相似的异步状态风险，但不是 ChatBox PR3 范围。

## 5. 当前代码问题定位

| 文件 | 当前问题 |
|---|---|
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | `uploadFiles` 并发预签名和 PUT，但没有 task map、AbortController 和 active guard |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | `replaceFiles(fileList.map(...))` 会用旧闭包批量写回，极端情况下能把刚删除的文件重新放回 |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | 进度和完成回调用旧 `fileIndex`，删除或排序后可能写错位置 |
| `projects/app/src/components/core/chat/ChatContainer/components/FilePreview.tsx` | close 按钮调用 `removeFiles(index)`，index 来自排序后的列表 |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/ChatInput.tsx` | 直接把 react-hook-form `removeFiles` 暴露给 UI |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/HumanChatBubble/EditForm.tsx` | 同样复用 `useFileUpload` 和 `FilePreview`，也需要接入取消入口 |
| `projects/app/src/web/common/file/api.ts` | `getUploadChatFilePresignedUrl` 没有暴露 request cancel config |
| `packages/web/common/file/utils.ts` | `putFileToS3` 没有接收 `AbortSignal` |

## 6. 设计原则

1. `uploadId` 是本地上传任务身份，不进入后端协议语义。
2. `uploadId` 与 react-hook-form field array 的内部 `id` 分离，避免被 RHF key 覆盖影响。
3. 不再把排序后的 UI index 传回业务层。
4. 不再用上传开始时的旧 index 写回。
5. 不做全量 `replaceFiles(oldFileList.map(...))` 来切换上传状态，避免旧闭包恢复已删除文件。
6. abort 错误是用户主动行为，不作为业务错误 toast。
7. 组件卸载时取消未完成任务，避免 unmount 后继续写表单状态。

## 7. 类型设计

`projects/app/src/components/core/chat/ChatContainer/ChatBox/type.ts`

建议先把 `uploadId` 设计成可选字段，而不是强制要求历史数据都立即补齐：

```ts
export type UserInputFileItemType = {
  id: string;
  /** 本地上传任务 ID，只用于前端取消、进度写回和删除定位。历史消息可能没有该字段。 */
  uploadId?: string;
  rawFile?: File;
  type: `${ChatFileTypeEnum}`;
  name: string;
  icon: string;
  status: 0 | 1;
  url?: string;
  key?: string;
  process?: number;
  error?: string;
};
```

原因：

1. 新选择的文件一定生成 `uploadId`。
2. 编辑历史消息时，旧 `defaultFiles` 或 `formatChatValue2InputType` 生成的文件可能没有 `uploadId`。
3. `uploadTask` 工具函数可以用 `uploadId ?? id` 做兼容定位。
4. 这样不会强迫历史消息文件结构跟着本地上传状态变化。

`status: 0 | 1` 暂时不改，降低 PR3 改动面。当前实际语义是：

| 字段 | 当前含义 |
|---|---|
| `status: 0` | 待上传 |
| `status: 1` 且无 `url` | 上传中 |
| `status: 1` 且有 `url` | 已完成 |

后续如果要继续整理，可以单独改成 `'pending' | 'uploading' | 'success' | 'error' | 'canceled'`，但不建议混进 PR3。

## 8. 文件组织

| 文件 | 类型 | 职责 |
|---|---|---|
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/type.ts` | 修改 | `UserInputFileItemType` 增加可选 `uploadId` |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils/uploadTask.ts` | 新增 | 上传任务 ID、定位、可写回判断、abort 错误识别 |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | 修改 | task map、cancel、按 `uploadId` 写回、卸载清理 |
| `projects/app/src/components/core/chat/ChatContainer/components/FilePreview.tsx` | 修改 | 删除回调从 index 改为 file/effective upload id |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/ChatInput.tsx` | 修改 | 使用 `cancelUploadFile` 和 `clearFiles` |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/HumanChatBubble/EditForm.tsx` | 修改 | 使用 `cancelUploadFile` |
| `projects/app/src/web/common/file/api.ts` | 修改 | `getUploadChatFilePresignedUrl(params, config?)` 支持取消配置 |
| `packages/web/common/file/utils.ts` | 修改 | `putFileToS3` 支持 `signal` |
| `projects/app/test/components/core/chat/ChatContainer/ChatBox/uploadTask.test.ts` | 新增 | 上传任务纯函数测试 |

## 9. 函数组织

### 9.1 `utils/uploadTask.ts`

纯函数集中放这里，便于单测。

| 函数 | 职责 |
|---|---|
| `createUploadId()` | 生成本地上传任务 ID |
| `getFileUploadId(file)` | 返回 `file.uploadId ?? file.id`，兼容旧文件 |
| `findFileIndexByUploadId(files, uploadId)` | 从当前 field array 中定位文件 |
| `canApplyUploadResult({ files, uploadId, canceled })` | 判断异步结果是否仍允许写回 |
| `isUploadAbortError(error)` | 识别 axios/browser abort 错误 |

`isUploadAbortError` 至少覆盖：

1. `error.name === 'AbortError'`
2. `error.name === 'CanceledError'`
3. `error.code === 'ERR_CANCELED'`
4. axios `isCancel(error)` 返回 true

### 9.2 `useFileUpload.tsx`

新增内部 task map：

```ts
type UploadTaskState = {
  controller: AbortController;
  canceled: boolean;
  key?: string;
};

const uploadTasksRef = useRef(new Map<string, UploadTaskState>());
const fileListRef = useRef(fileList);
```

关键局部函数：

| 函数 | 职责 |
|---|---|
| `registerUploadTask(uploadId)` | 如果任务不存在，创建 `AbortController` 并记录 |
| `cancelUploadTask(uploadId)` | 标记 `canceled = true` 并调用 `controller.abort()` |
| `cleanupUploadTask(uploadId)` | promise settled 后清理 task map |
| `syncFileListRef(nextFiles)` | 写回本地 ref，避免下一次 progress 在 React render 前读到旧数组 |
| `updateFileByUploadId(uploadId, patch)` | 当前文件仍存在且任务未取消时，按当前 index 更新 |
| `removeFileByUploadId(uploadId)` | 按当前 field array index 移除，并同步 `fileListRef` |
| `cancelUploadFile(uploadId)` | UI 删除入口，取消请求并移除占位 |
| `cancelAllUploadTasks()` | 组件卸载或整体清空时取消所有未完成任务 |
| `clearFiles()` | 取消所有任务并 `replaceFiles([])`，用于发送后清空或语音发送清空 |

`updateFileByUploadId` 必须满足：

1. 每次调用都从 `fileListRef.current` 找当前 index。
2. 找不到文件则直接 return。
3. task 已取消则直接 return。
4. 调用 `updateFiles(index, nextFile)` 前，先乐观更新 `fileListRef.current`。

### 9.3 `getUploadChatFilePresignedUrl`

`projects/app/src/web/common/file/api.ts`

当前 `POST` 已支持第三个 `config` 参数，内部可以传 `cancelToken?: AbortController`。因此 wrapper 只需要透传：

```ts
export const getUploadChatFilePresignedUrl = (
  params: PresignChatFilePostUrlParams,
  config?: Parameters<typeof POST>[2]
) => {
  return POST<CreatePostPresignedUrlResponseType>(
    '/core/chat/file/presignChatFilePostUrl',
    params,
    config
  );
};
```

如果 TypeScript 不方便拿到 `ConfigType`，不要为了这个新增一个全局类型导出；可以在本文件局部收窄为 `{ cancelToken?: AbortController }`。

### 9.4 `putFileToS3`

`packages/web/common/file/utils.ts`

增加 `signal?: AbortSignal`：

```ts
await axios.put(url, file, {
  headers: {
    ...headers
  },
  onUploadProgress,
  signal,
  timeout: 5 * 60 * 1000
});
```

注意：`putFileToS3` 当前 catch 会调用 `parseS3UploadError`。PR3 可以有两种选择：

1. 在 `putFileToS3` 内部识别 abort，直接原样 reject。
2. 在 `useFileUpload` catch 中识别 `parseS3UploadError` 包装后的取消错误。

推荐第 1 种。取消不是 S3 业务错误，没必要进入 S3 错误翻译。

## 10. 上传状态机

### 10.1 选择文件

1. 用户选择文件。
2. 为每个文件生成 `uploadId`。
3. append 到 field array。
4. `useRequest(uploadFiles)` 因 `fileList` 变化触发上传。

### 10.2 启动上传

1. `uploadFiles` 只取当前 `status === 0` 且有 `rawFile` 的文件。
2. 每个文件启动前取 `effectiveUploadId = getFileUploadId(file)`。
3. 如果 task map 里已经存在这个 uploadId，跳过，避免重复上传。
4. 不再批量 `replaceFiles(fileList.map(...))`。
5. 调用 `updateFileByUploadId(uploadId, { status: 1 })` 单个文件切换为上传中。

### 10.3 预签名

1. 注册 `AbortController`。
2. 调用 `getUploadChatFilePresignedUrl(params, { cancelToken: controller })`。
3. 如果用户在预签名阶段取消，请求被 abort。
4. catch 识别 abort 后直接 return，不 toast。

### 10.4 PUT 上传

1. 调用 `putFileToS3({ signal: controller.signal })`。
2. `onUploadProgress` 中按 `uploadId` 查当前文件。
3. 文件不存在或 task 已取消时，不写回进度。
4. 正常进度只 patch `process`。

### 10.5 成功写回

1. PUT 成功后按 `uploadId` 查当前文件。
2. 文件仍存在且 task 未取消，写入 `url/key/process/status`。
3. 文件已删除则不写回。

### 10.6 失败处理

1. abort/cancel 错误：不 toast、不写回、不移除其他文件。
2. 普通错误：toast warning，并按 `uploadId` 移除当前失败文件。
3. 不再收集旧 index 到 `errorFileIndex`，避免删除错文件。

### 10.7 清理

1. 每个任务在 `finally` 调用 `cleanupUploadTask(uploadId)`。
2. 组件 unmount 时调用 `cancelAllUploadTasks()`。
3. `clearFiles()` 先取消任务，再 `replaceFiles([])`。

## 11. UI 调整

`FilePreview` props 建议从：

```ts
removeFiles?: (index?: number | number[]) => void;
```

改为：

```ts
onRemoveFile?: (file: FieldArrayWithId<ChatBoxInputFormType, 'files', 'id'>) => void;
```

close 按钮：

```tsx
onClick={() => onRemoveFile?.(item)}
```

由 `useFileUpload` 的调用方决定：

```tsx
<FilePreview fileList={fileList} onRemoveFile={(file) => cancelUploadFile(getFileUploadId(file))} />
```

也可以把 `getFileUploadId` 放在 `FilePreview` 内直接传 `uploadId`，但更推荐传 `file` 给上层，避免预览组件理解上传任务细节过多。

`key` 也应该从 `index` 改成稳定值：

```tsx
key={getFileUploadId(item)}
```

## 12. ChatInput 和 EditForm 接入

### 12.1 `ChatInput`

`useFileUpload` 返回值建议调整为：

```ts
return {
  File,
  onOpenSelectFile,
  fileList: sortFileList,
  onSelectFile,
  uploadFiles,
  cancelUploadFile,
  clearFiles,
  replaceFiles,
  hasFileUploading,
  ...
};
```

主输入框：

1. `FilePreview` 使用 `onRemoveFile` 调用 `cancelUploadFile`。
2. 正常发送成功后用 `clearFiles()`，不要直接 `replaceFiles([])`。
3. 语音发送回调也用 `clearFiles()`，避免绕过取消逻辑。

### 12.2 `HumanChatBubble/EditForm`

编辑态也复用 `useFileUpload`，所以：

1. `FilePreview` 同样使用 `onRemoveFile`。
2. 提交时不需要特殊处理，`canSubmit = !hasFileUploading && trimmedValue.length > 0` 已经阻止上传中提交。
3. 组件卸载时由 hook cleanup 取消未完成上传。

## 13. 清理与残留对象

PR3 不新增前端删除对象 API，原因：

1. 点击取消时，请求可能处于预签名前、预签名后、PUT 中、PUT 即将成功这几个阶段，前端不能可靠判断对象是否已经完整写入。
2. 强行在前端 cancel 后调用删除对象 API，会引入新的鉴权、幂等、误删和竞态问题。
3. 当前 Chat 文件保存成功后会移除对应 `s3_ttls`，未保存成功的临时对象保留 TTL，由已有 cleanup 清理。

因此 PR3 的清理边界是：

| 阶段 | 取消后的处理 |
|---|---|
| 预签名前 | 无对象，无需清理 |
| 预签名后但 PUT 前 | upload session/token 走自身 TTL |
| PUT 过程中 | 浏览器 abort 请求；极限情况下写入完成的对象仍按 S3 TTL 清理 |
| PUT 已成功但用户删除预览 | 从输入框移除；未发送则 TTL 清理，已发送则聊天保存流程保留文件 |

## 14. 错误处理

用户主动取消不应该进入普通上传错误 toast。

建议 catch 结构：

```ts
} catch (error) {
  if (isUploadAbortError(error) || task.canceled) {
    return;
  }

  toast({
    status: 'warning',
    title: t(getErrText(error, t('common:error.upload_file_error_filename', { name: file.name })))
  });

  removeFileByUploadId(uploadId);
} finally {
  cleanupUploadTask(uploadId);
}
```

需要注意：如果 `putFileToS3` 继续把 abort 包成业务错误，`isUploadAbortError` 可能识别不到，所以推荐在 `putFileToS3` 内部先判断 abort，再跳过 `parseS3UploadError`。

## 15. Tasks

- [x] PR3-T1 `UserInputFileItemType` 增加可选 `uploadId`，并补充字段注释。
- [x] PR3-T2 新增 `utils/uploadTask.ts`，实现 `createUploadId/getFileUploadId/findFileIndexByUploadId/canApplyUploadResult/isUploadAbortError`。
- [x] PR3-T3 选择文件时为新文件生成 `uploadId`。
- [x] PR3-T4 `useFileUpload` 增加 `uploadTasksRef` 和 `fileListRef`。
- [x] PR3-T5 `useFileUpload` 移除批量 `replaceFiles(fileList.map(...))` 启动上传逻辑，改为按 `uploadId` 单项更新。
- [x] PR3-T6 `useFileUpload` 增加 `registerUploadTask/cancelUploadTask/cleanupUploadTask`。
- [x] PR3-T7 `useFileUpload` 增加 `updateFileByUploadId/removeFileByUploadId/cancelUploadFile/cancelAllUploadTasks/clearFiles`。
- [x] PR3-T8 `uploadFiles` 预签名阶段传入 cancel config。
- [x] PR3-T9 `putFileToS3` 支持 `AbortSignal`，并让 abort 错误原样抛出。
- [x] PR3-T10 上传进度、成功、失败回调全部改为按 `uploadId` 查当前文件。
- [x] PR3-T11 abort/cancel 后不 toast、不写回、不删除其他文件。
- [x] PR3-T12 `FilePreview` 删除入口改为 `onRemoveFile(file)`，React key 改为稳定 ID。
- [x] PR3-T13 `ChatInput` 使用 `cancelUploadFile` 和 `clearFiles`。
- [x] PR3-T14 `HumanChatBubble/EditForm` 使用 `cancelUploadFile`。
- [x] PR3-T15 补充 `uploadTask.test.ts`，覆盖定位、兼容旧文件、abort 错误识别、取消后禁止写回。
- [x] PR3-T16 运行 PR3 局部测试。
- [ ] PR3-T17 手测主输入框和编辑态：取消预签名、取消 PUT、取消后不重现、普通上传失败仍提示。

## 16. 测试建议

局部测试：

```bash
pnpm test projects/app/test/components/core/chat/ChatContainer/ChatBox/file.test.ts
pnpm test projects/app/test/components/core/chat/ChatContainer/ChatBox/uploadTask.test.ts
```

新增用例：

1. 新文件有 `uploadId`，历史文件没有 `uploadId` 时 fallback 到 `id`。
2. 排序后的 `fileList` 删除时，按 effective upload id 定位正确文件。
3. 文件被删除后，`canApplyUploadResult` 返回 false。
4. task canceled 后，`canApplyUploadResult` 返回 false。
5. `isUploadAbortError` 能识别 `AbortError`、`CanceledError`、`ERR_CANCELED`。
6. 普通 Error 不被识别为 abort。

手测用例：

1. 选一个大文件，预签名或上传中点击关闭，Network 请求进入 canceled/aborted。
2. 取消后等待 10 秒，文件不重新出现在列表。
3. 同时上传多个文件，删除其中一个，不影响其他文件继续上传。
4. 图片和普通文件混排后删除，删除的是点击的那个文件。
5. 编辑历史用户消息时上传新文件，再取消，行为与主输入框一致。
6. 人为制造上传失败，仍然出现 warning toast，并只移除失败文件。

## 17. 验收标准

1. 用户点击关闭按钮后，正在进行的预签名或上传请求会被 abort。
2. 上传完成回调不会让已取消文件重新出现。
3. 排序后的文件列表不会删错文件。
4. 用户主动取消不会出现上传失败 toast。
5. 主输入框和用户消息编辑态都支持同样的取消行为。
6. 组件卸载后不会继续写回 field array。
7. 普通上传失败仍保留现有提示能力。

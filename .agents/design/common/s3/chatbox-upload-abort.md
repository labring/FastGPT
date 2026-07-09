# ChatBox 上传 Abort 设计

## 0. 文档标识

- 任务前缀：`s3-refactor-chatbox-abort`
- 文档文件名：`chatbox-upload-abort.md`
- 更新时间：2026-07-03
- 推荐 PR：PR 3
- 优先级：P2

## 1. 需求背景

ChatBox 输入框上传文件时，会出现文件图标和上传 loading 占位。当前 hover 后点击关闭按钮，只会从前端表单数组移除该占位；底层预签名请求或 S3 上传请求仍在继续。

上传完成后，异步回调仍可能调用 `updateFiles(fileIndex, copyFile)`，导致已经移除的文件重新出现在上传列表中。

## 2. 目标

1. 用户点击关闭按钮后，真正 abort 预签名或上传请求。
2. 已取消文件不会被上传完成回调重新写回。
3. 删除文件时使用稳定 `uploadId`，不再依赖排序后的 UI index。
4. 用户主动取消不展示上传失败 toast。

## 3. 非目标

1. 不改 S3 短链票据。
2. 不改服务端文件类型校验。
3. 不重构整个 ChatBox。
4. 不改变消息发送协议。

## 4. 当前问题定位

相关文件：

| 文件 | 现状 |
|---|---|
| `useFileUpload.tsx` | `uploadFiles` 并发执行预签名和 `putFileToS3`，没有 AbortController |
| `FilePreview.tsx` | close 按钮调用 `removeFiles(index)` |
| `ChatInput.tsx` | 把 react-hook-form 的 `removeFiles` 直接传给 `FilePreview` |
| `packages/web/common/file/utils.ts` | `putFileToS3` 不接收 `AbortSignal` |

核心问题：

1. UI 删除只删除 field array 项，不取消异步任务。
2. 异步任务用闭包里的 `fileIndex` 写回，文件已经被移除后仍可能更新。
3. `fileList` 在 UI 中会排序，排序后的 index 和原始 field array index 可能不一致。

## 5. 设计原则

1. 上传任务身份使用稳定 `uploadId`。
2. `uploadId` 和 react-hook-form field array 的内部 `id` 分离。
3. 上传任务用 `AbortController` 管理生命周期。
4. 所有进度、成功、失败回调写回前都检查任务是否仍 active。
5. 取消错误不当作上传失败提示给用户。

## 6. 类型调整

`projects/app/src/components/core/chat/ChatContainer/ChatBox/type.ts`

```ts
export type UserInputFileItemType = {
  id: string;
  uploadId: string;
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

第一步可以保留 `status: 0 | 1` 降低改动面。后续如果要更清晰，可以再升级为：

```ts
type UploadStatus = 'pending' | 'uploading' | 'success' | 'error' | 'canceled';
```

## 7. 文件组织

| 文件 | 类型 | 职责 |
|---|---|---|
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/type.ts` | 修改 | `UserInputFileItemType` 增加 `uploadId` |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils/uploadTask.ts` | 新增 | 上传任务纯函数 |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useFileUpload.tsx` | 修改 | upload task map、cancel、按 uploadId 写回 |
| `projects/app/src/components/core/chat/ChatContainer/components/FilePreview.tsx` | 修改 | `onRemoveFile(uploadId)` |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/ChatInput.tsx` | 修改 | 传入 `cancelUploadFile` |
| `packages/web/common/file/utils.ts` | 修改 | `putFileToS3` 支持 `signal` |
| `projects/app/src/web/common/file/api.ts` | 修改 | `getUploadChatFilePresignedUrl(params, config?)` |

## 8. 函数组织

### 8.1 `utils/uploadTask.ts`

纯函数，便于单测：

| 函数 | 职责 |
|---|---|
| `createUploadId()` | 生成本地上传任务 ID |
| `findFileIndexByUploadId(files, uploadId)` | 从 field array 中定位文件 |
| `removeFileByUploadId({ files, uploadId })` | 返回移除目标 index 或移除后的列表 |
| `canApplyUploadResult({ files, uploadId, canceled })` | 判断异步结果是否还能写回 |
| `isUploadAbortError(error)` | 识别 axios/browser abort 错误 |

### 8.2 `useFileUpload.tsx`

新增内部任务 map：

```ts
const uploadTasksRef = useRef(
  new Map<string, { controller: AbortController; canceled: boolean; key?: string }>()
);
```

建议局部函数：

| 函数 | 职责 |
|---|---|
| `registerUploadTask(uploadId)` | 创建并记录 AbortController |
| `cancelUploadTask(uploadId)` | 标记 canceled 并 abort |
| `cleanupUploadTask(uploadId)` | 上传结束后清理 task map |
| `updateFileByUploadId(uploadId, patch)` | 按 uploadId 安全更新 field array |
| `removeFileByUploadId(uploadId)` | 按 uploadId 移除 field array |
| `cancelUploadFile(uploadId)` | UI 删除入口，取消请求并移除占位 |

`cancelUploadFile` 示例：

```ts
const cancelUploadFile = useCallback((uploadId: string) => {
  const task = uploadTasksRef.current.get(uploadId);
  task?.controller.abort();
  if (task) {
    task.canceled = true;
  }
  removeFileByUploadId(uploadId);
}, []);
```

## 9. 上传流程

1. 用户选择文件。
2. 为每个文件生成 `uploadId`。
3. append 到 field array。
4. `uploadFiles` 扫描待上传文件。
5. 为每个 uploadId 注册 AbortController。
6. 预签名请求传 cancel config。
7. `putFileToS3` 传 `signal`。
8. 进度回调按 uploadId 查找当前项；如果已取消，不写回。
9. 成功回调按 uploadId 查找当前项；如果已取消，不写回。
10. catch 中如果是 abort error，不 toast。
11. finally 清理 task map。

## 10. UI 调整

`FilePreview` props 从：

```ts
removeFiles?: (index?: number | number[]) => void;
```

改为：

```ts
onRemoveFile?: (uploadId: string) => void;
```

close 按钮：

```tsx
onClick={() => onRemoveFile?.(item.uploadId)}
```

这样即使 `fileList` 是排序后的 clone，也不会删错原始 field array 项。

## 11. 工具函数调整

`packages/web/common/file/utils.ts`

```ts
export const putFileToS3 = async ({
  signal,
  ...
}: {
  signal?: AbortSignal;
  ...
}) => {
  await axios.put(url, file, {
    signal,
    ...
  });
};
```

`projects/app/src/web/common/file/api.ts`

```ts
export const getUploadChatFilePresignedUrl = (
  params: PresignChatFilePostUrlParams,
  config?: { cancelToken?: AbortController }
) => POST<CreatePostPresignedUrlResponseType>('/core/chat/file/presignChatFilePostUrl', params, config);
```

## 12. Tasks

- [ ] PR3-T1 `UserInputFileItemType` 增加 `uploadId`。
- [ ] PR3-T2 新增 `utils/uploadTask.ts`，实现 uploadId 定位、写回判断、abort 错误识别。
- [ ] PR3-T3 选择文件时生成 `uploadId`。
- [ ] PR3-T4 `useFileUpload` 增加 upload task map。
- [ ] PR3-T5 `useFileUpload` 增加 `cancelUploadFile(uploadId)`。
- [ ] PR3-T6 `getUploadChatFilePresignedUrl` 支持 cancel config。
- [ ] PR3-T7 `putFileToS3` 支持 `AbortSignal`。
- [ ] PR3-T8 上传进度和完成回调改为按 `uploadId` 查找当前文件。
- [ ] PR3-T9 取消后的 promise resolve/reject 不 toast、不写回。
- [ ] PR3-T10 `FilePreview` 改为 `onRemoveFile(uploadId)`。
- [ ] PR3-T11 `ChatInput` 传入 `cancelUploadFile`。
- [ ] PR3-T12 补充上传任务纯函数测试。
- [ ] PR3-T13 运行 PR3 局部测试并手测 ChatBox。

## 13. 测试

建议局部测试：

```bash
pnpm test projects/app/test/components/core/chat/ChatContainer/ChatBox/file.test.ts
```

新增或扩展用例：

1. 排序后的 fileList 删除时，按 uploadId 删除正确文件。
2. 上传中取消会调用 AbortController.abort。
3. 取消后上传 promise resolve，不调用 updateFiles。
4. 取消错误不弹 warning toast。
5. 已上传成功文件删除不影响其他上传任务。

## 14. 验收标准

1. 用户点击关闭按钮后，Network 中上传请求被 abort。
2. 上传完成回调不会让已取消文件重新出现。
3. 排序后的文件列表不会删错文件。
4. 用户主动取消不会出现上传失败 toast。

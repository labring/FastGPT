# 微信个人号文件接收方案设计

> 文件路径：`packages/service/support/outLink/wechat/`

## 一、背景与现状

### 当前架构

```
ILink API (长轮询) → mq.ts → messageParser.ts → outlinkInvokeChat()
```

- **消息拉取**：`ILinkClient.getUpdates()` 长轮询，返回 `WeixinMessage[]`
- **消息解析**：`messageParser.ts` 只处理 `text`（type=1）和 `voice`（type=3）
- **查询构造**：仅传递 `{ text: { content: group.text } }` 给 workflow
- **文件支持**：❌ 完全缺失

### FastGPT 已有基础设施

| 能力 | 实现位置 | 说明 |
|------|----------|------|
| 图片存储 | `file/image/controller.ts` → `uploadMongoImg()` | base64 存 MongoDB，返回内部 URL |
| 文件存储 | `file/gridfs/` (BucketNameEnum.chat) | GridFS 流式存储 |
| Chat 输入类型 | `global/core/chat/type.ts` → `UserChatItemValueItemType` | 支持 `text` + `file(image/file)` |

### `UserChatItemValueItemType` 结构

```typescript
type UserChatItemValueItemType = {
  text?: { content: string };
  file?: {
    type: 'image' | 'file';   // ChatFileTypeEnum
    name?: string;
    key?: string;
    url: string;              // 内部访问 URL
  };
};
```

---

## 二、目标

支持微信用户通过 iLink 渠道向 FastGPT 发送：

| 类型 | 来源 | 处理方式 |
|------|------|----------|
| 图片 | `item_list[].type = 2` | 下载 → 存 MongoImage → 内部 URL |
| 文件/附件 | `item_list[].type = 5` | 下载 → 存 GridFS(chat) → 内部 URL |
| 视频 | `item_list[].type = 4` | 下载 → 存 GridFS(chat) → 内部 URL（可选）|

---

## 三、S3 存储方案

### 核心选择：`S3ChatSource.uploadChatFile()`

| 字段 | 值 |
|------|----|
| 存储路径 | `chat/{appId}/{uId}/{chatId}/{filename}` |
| 存储桶 | Private Bucket（私有，需鉴权访问） |
| TTL | 1 小时（由 `MongoS3TTL` 自动清理） |
| 访问 URL | `createGetChatFileURL({ key, expiredHours: 24 })` 生成预签名 URL |

### 调用关系

```
getS3ChatSource()
  └── uploadChatFile({ appId, chatId, uId, filename, buffer, contentType })
        └── getFileS3Key.chat(...)  →  key = "chat/{appId}/{uId}/{chatId}/{filename}"
        └── uploadFileByBody({ key, buffer, contentType })
              ├── MongoS3TTL.create({ expiredTime: +1h })   // 文件 1 小时后自动清理
              ├── client.uploadObject(...)
              └── returns { key, accessUrl }               // accessUrl 预签名 2h
```

### URL 传入 workflow

```typescript
// UserChatItemValueItemType.file
{
  type: 'image' | 'file',   // ChatFileTypeEnum
  name: string,             // 原始文件名
  key: string,              // S3 object key，用于后续删除/引用
  url: string               // 预签名 URL（accessUrl，2h 内有效）
}
```

> 由于 workflow 在文件上传后立即执行，2 小时访问窗口完全够用。

---

## 四、ILink API 消息结构（推断）

基于 iLink WeChat Bot API 常见规范，图片/文件消息的 `item_list` 元素结构：

```typescript
// 图片消息项（type = 2）
type ImageMessageItem = {
  type: 2;
  image_item?: {
    cdn_url: string;       // 图片 CDN 直链（有效期有限）
    aes_key?: string;      // 加密 key（若内容加密）
    file_size?: number;    // 字节数
    width?: number;
    height?: number;
  };
};

// 文件消息项（type = 5）
type FileMessageItem = {
  type: 5;
  file_item?: {
    file_id?: string;      // 文件 ID（用于获取下载链接）
    file_name: string;     // 原始文件名
    cdn_url?: string;      // 文件 CDN 直链（有效期有限）
    file_size?: number;
    file_ext?: string;     // 扩展名 e.g. "pdf"
  };
};
```

> **注意**：实际字段需与 iLink API 文档对齐。本方案设计为可扩展结构，字段名通过常量隔离，便于修正。

---

## 四、方案设计

### 4.1 整体流程

```
ILink getUpdates()
   ↓
MessageItem[]
   ↓ (messageParser)
ParsedMessageGroup {
  userId, text, contextToken, msgIds,
  files: [{ type, tempUrl, name }]  ← 新增
}
   ↓ (mq.ts - processUserGroup)
downloadAndStoreFiles()   ← 新增
   ↓
UserChatItemValueItemType[] = [
  { text: { content: "..." } },
  { file: { type: "image", url: "http://..." } },
  { file: { type: "file", url: "http://...", name: "report.pdf" } }
]
   ↓
outlinkInvokeChat({ query: [...] })
```

### 4.2 变更范围

共涉及 **4 个文件**：

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `ilinkClient.ts` | 扩展类型 + 新增方法 | 添加图片/文件 Item 类型；添加 `downloadMedia()` |
| `messageParser.ts` | 扩展逻辑 + 类型 | 解析图片/文件 item，收集 `tempUrl` |
| `wechat/fileHandler.ts` | **新建** | 下载 → 存储 → 返回内部 URL |
| `mq.ts` | 扩展逻辑 | 调用 fileHandler，拼装 query 数组 |

---

## 五、详细设计

### 5.1 `ilinkClient.ts` — 扩展类型与下载能力

#### 新增类型

```typescript
// 在 MessageItem 基础上扩展
export type MessageItem = {
  type: number;
  text_item?: { text: string };
  voice_item?: { text: string };
  ref_msg?: { title?: string };
  // 新增
  image_item?: {
    cdn_url?: string;
    file_size?: number;
    width?: number;
    height?: number;
  };
  file_item?: {
    file_id?: string;
    file_name?: string;
    cdn_url?: string;
    file_size?: number;
    file_ext?: string;
  };
};

// 媒体下载结果
export type MediaDownloadResult = {
  buffer: Buffer;
  mimeType: string;
  fileName?: string;
  fileSize: number;
};
```

#### 新增方法 `downloadMedia()`

```typescript
// 最大允许下载文件大小（20MB）
const MAX_MEDIA_SIZE = 20 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;

async downloadMedia(url: string, fileName?: string): Promise<MediaDownloadResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: this.buildHeaders(),  // 携带 token 鉴权
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`Media download failed: HTTP ${res.status}`);

    const contentLength = Number(res.headers.get('content-length') || 0);
    if (contentLength > MAX_MEDIA_SIZE) {
      throw new Error(`File too large: ${contentLength} bytes`);
    }

    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_MEDIA_SIZE) {
      throw new Error(`File too large: ${buffer.length} bytes`);
    }

    const contentType = res.headers.get('content-type') || 'application/octet-stream';
    const mimeType = contentType.split(';')[0].trim();

    return { buffer, mimeType, fileName, fileSize: buffer.length };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
```

---

### 5.2 `messageParser.ts` — 扩展解析逻辑

#### 新增常量与类型

```typescript
const MSG_ITEM_IMAGE = 2;
const MSG_ITEM_FILE = 5;

// 解析出的媒体引用（尚未下载，只存 URL 和元信息）
export type ParsedMediaRef = {
  type: 'image' | 'file';
  tempUrl: string;       // iLink CDN URL（有效期有限）
  name?: string;         // 原始文件名
};

// 扩展 ParsedMessageGroup
export type ParsedMessageGroup = {
  userId: string;
  text: string;
  contextToken: string;
  msgIds: string[];
  mediaRefs: ParsedMediaRef[];   // 新增：待下载的媒体引用
};
```

#### 更新 `extractTextFromItem` 和 `groupMessagesByUser`

```typescript
// extractTextFromItem 保持不变，仍只返回文本

// 新增：从 item 提取媒体引用
export function extractMediaRefFromItem(
  item: NonNullable<WeixinMessage['item_list']>[number]
): ParsedMediaRef | null {
  if (item.type === MSG_ITEM_IMAGE && item.image_item?.cdn_url) {
    return {
      type: 'image',
      tempUrl: item.image_item.cdn_url,
      name: undefined
    };
  }
  if (item.type === MSG_ITEM_FILE && item.file_item?.cdn_url) {
    return {
      type: 'file',
      tempUrl: item.file_item.cdn_url,
      name: item.file_item.file_name
    };
  }
  return null;
}
```

在 `groupMessagesByUser` 中：

```typescript
// 处理逻辑变更：消息中若包含文件但无文本，也纳入分组（原逻辑会跳过无文本消息）
for (const msg of msgs) {
  if (msg.message_type !== MSG_TYPE_USER) continue;

  let text = '';
  const mediaRefs: ParsedMediaRef[] = [];

  for (const item of msg.item_list ?? []) {
    if (!text) {
      const t = extractTextFromItem(item);
      if (t) text = t;
    }
    const ref = extractMediaRefFromItem(item);
    if (ref) mediaRefs.push(ref);
  }

  // 关键变更：无文本但有媒体时也处理
  if (!text && mediaRefs.length === 0) continue;

  // ... 合并到分组（mediaRefs 追加合并）
}
```

---

### 5.3 `wechat/fileHandler.ts` — 新建文件处理模块

图片和文件**统一存入 S3 私有桶**（`chat` source），通过 `S3ChatSource.uploadChatFile()` 写入，
上传完成后用 `createGetChatFileURL()` 生成预签名 URL 传给 workflow。

```typescript
import type { MediaDownloadResult } from './ilinkClient';
import { getS3ChatSource } from '../../../common/s3/sources/chat';
import type { UserChatItemFileItemType } from '@fastgpt/global/core/chat/type';
import { ChatFileTypeEnum } from '@fastgpt/global/core/chat/constants';
import mime from 'mime-types';

export type MediaStoreResult = UserChatItemFileItemType;

/**
 * 统一入口：下载 iLink CDN 文件 → 存入 S3(chat) → 返回预签名 URL
 *
 * S3 key:  chat/{appId}/{uId}/{chatId}/{filename}
 * TTL:     文件 1h（MongoS3TTL 自动清理）；预签名 URL 24h
 */
export async function downloadAndStoreMedia(params: {
  type: 'image' | 'file';
  tempUrl: string;
  name?: string;
  appId: string;
  chatId: string;
  uId: string;
  downloadFn: (url: string, name?: string) => Promise<MediaDownloadResult>;
}): Promise<MediaStoreResult | null> {
  const { type, tempUrl, name, appId, chatId, uId, downloadFn } = params;

  try {
    const media = await downloadFn(tempUrl, name);

    const ext = mime.extension(media.mimeType) || 'bin';
    const filename = media.fileName || `wechat_${type}_${Date.now()}.${ext}`;

    const chatSource = getS3ChatSource();

    // 上传到 S3，返回 { key, accessUrl }
    // accessUrl 是 createExternalUrl({ key, expiredHours: 2 }) 的预签名 URL
    const { key, accessUrl } = await chatSource.uploadChatFile({
      appId,
      chatId,
      uId,
      filename,
      buffer: media.buffer,
      contentType: media.mimeType
    });

    // 生成更长有效期的预签名 URL 供 workflow 访问（24h）
    const url = await chatSource.createGetChatFileURL({
      key,
      expiredHours: 24,
      external: false
    });

    return {
      type: type === 'image' ? ChatFileTypeEnum.image : ChatFileTypeEnum.file,
      name: filename,
      key,
      url
    };
  } catch (error) {
    // 单个文件失败不中断整体流程，上层记录日志
    return null;
  }
}
```

---

### 5.4 `mq.ts` — 扩展 processUserGroup

```typescript
async function processUserGroup(
  outLink: OutLinkSchemaType<WechatAppType>,
  group: ParsedMessageGroup
): Promise<void> {
  const app = outLink.app;
  const chatId = `wechat_${outLink.shareId}_${group.userId}`;
  const client = new ILinkClient(app.baseUrl, app.token);

  // 1. 并发下载所有媒体文件（最多 5 个，防止超载）
  const maxFiles = 5;
  const mediaRefs = group.mediaRefs.slice(0, maxFiles);

  const fileResults = await Promise.allSettled(
    mediaRefs.map((ref) =>
      downloadAndStoreMedia({
        type: ref.type,
        tempUrl: ref.tempUrl,
        name: ref.name,
        teamId: outLink.teamId,
        shareId: outLink.shareId,
        downloadFn: (url, name) => client.downloadMedia(url, name)
      })
    )
  );

  // 2. 构造 UserChatItemValueItemType[]
  const query: UserChatItemValueItemType[] = [];

  // 文本（如有）
  if (group.text) {
    query.push({ text: { content: group.text } });
  }

  // 成功上传的文件
  for (const result of fileResults) {
    if (result.status === 'fulfilled' && result.value) {
      query.push({ file: result.value });
    }
  }

  // 若 query 为空（全部失败），回复提示
  if (query.length === 0) {
    await client.sendMessage({
      to_user_id: group.userId,
      text: '文件处理失败，请重试。',
      context_token: group.contextToken
    });
    return;
  }

  try {
    await outlinkInvokeChat({
      outLinkConfig: outLink,
      chatId,
      query,
      messageId: group.msgIds[group.msgIds.length - 1],
      chatUserId: group.userId,
      replyCallback: async (replyContent: string) => {
        await client.sendMessage({
          to_user_id: group.userId,
          text: replyContent,
          context_token: group.contextToken
        });
        return { errcode: 0 };
      }
    });
  } catch (error) {
    // 错误处理（原有逻辑不变）
    ...
  }
}
```

---

## 六、文件大小与类型限制

| 配置项 | 建议值 | 说明 |
|--------|--------|------|
| 单文件最大 | 20 MB | WeChat 个人号文件上限通常 ≤ 20MB |
| 单消息最多文件 | 5 个 | 防止并发过多 |
| 允许图片 MIME | `image/*` | 统一走图片存储 |
| 允许文件类型 | 不限制（由 workflow 处理） | GridFS 存储，workflow 层可再过滤 |
| 下载超时 | 30s | 防止 CDN 链接失效导致卡死 |

---

## 七、错误处理策略

| 场景 | 处理方式 |
|------|----------|
| CDN URL 过期 / 无效 | 跳过该文件，继续处理文本；文件全部失败时回复提示 |
| 文件过大 | 抛出错误，日志记录，回复"文件过大"提示 |
| 图片 MIME 不合法 | `uploadMongoImg` 内部校验，返回 null，跳过 |
| 单文件下载超时 | AbortController 控制，记录日志后 null |
| 全部文件失败但有文本 | 仍走 workflow，文件部分缺失 |
| 全部内容失败 | 发送固定错误消息给用户 |

---

## 八、待确认事项

在开始编码前，需要确认以下 iLink API 细节：

1. **图片消息 item type 值**：是否为 `2`？字段名是否为 `image_item`？
2. **文件消息 item type 值**：是否为 `5`？字段名是否为 `file_item`？
3. **CDN URL 有效期**：URL 可以直接 fetch 还是需要携带 token 鉴权？
4. **是否有专用下载 API**：是否有类似 `/ilink/bot/getmedia?file_id=xxx` 的接口？
5. **文件大小限制**：iLink 对单消息文件大小有何限制？

---

## 九、新增文件清单

```
packages/service/support/outLink/wechat/
├── ilinkClient.ts          修改：扩展 MessageItem 类型，新增 downloadMedia()
├── messageParser.ts        修改：新增 extractMediaRefFromItem()，扩展 ParsedMessageGroup
├── fileHandler.ts          新建：下载 + 存储媒体文件
├── mq.ts                   修改：调用 fileHandler，拼装 query
└── type.ts                 保持不变
```

---

## 十、测试用例设计

| 用例 | 输入 | 期望输出 |
|------|------|----------|
| 纯文字消息 | text item | 不变，query=[text] |
| 图片消息 | image item + 无文本 | query=[file(image)] |
| 图片 + 文字 | text + image | query=[text, file(image)] |
| 文件附件 | file item | query=[file(file)] |
| 多文件 | 3 个图片 | query=[file, file, file] |
| 超大文件 | 文件 > 20MB | 跳过，回复提示 |
| CDN 失效 | 404 URL | 跳过，文本正常走 |
| 全部文件失败 + 无文本 | 空 | 发送错误提示 |

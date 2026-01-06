import type { Readable } from 'node:stream';

/**
 * 对象存储（S3/MinIO/OSS/COS/...）统一类型定义。
 *
 * 设计目标：
 * - **与厂商无关**：业务侧只依赖这些类型，不直接依赖具体云 SDK 的类型。
 * - **Node 友好**：避免 DOM 专属类型（例如 `Blob` / `ReadableStream`），在服务端环境开箱即用。
 * - **可扩展**：当新增厂商或能力（分页、分片上传、ACL 等）时，优先在这里扩展类型，再由各 adapter 负责实现。
 */

/**
 * 存储桶名称（Bucket name）。
 *
 * 说明：
 * - 本质上是 string，但为了语义清晰单独起别名。
 * - 具体命名规则由厂商决定（长度、字符集、是否全局唯一等）。
 */
export type StorageBucketName = string;

/**
 * 对象 key（Object key / object path）。
 *
 * 说明：
 * - 在同一个 bucket 内唯一标识一个对象。
 * - 通常形如：`a/b/c.txt`（用 `/` 形成“目录”层级，但对象存储并不是真正的目录结构）。
 */
export type StorageObjectKey = string;

/**
 * 对象元数据（Metadata）。
 *
 * 说明：
 * - 用于承载用户自定义键值对（以及 adapter 可能返回的部分系统字段）。
 * - 由于不同厂商对 key/value 的限制差异较大，这里使用宽泛的 `Record<string, string>`，由 adapter 做必要的转换/过滤。
 *
 * 建议：
 * - 自定义 key 尽量使用小写 ASCII 与短横线/下划线，避免特殊字符与大小写歧义。
 */
export type StorageObjectMetadata = Record<string, string>;

/**
 * 上传内容（body）支持的类型（Node.js 环境）。
 *
 * - `Buffer`: 二进制内容（推荐用于小/中等体积文件）。
 * - `string`: 文本内容（注意编码，一般为 UTF-8）。
 * - `Readable`: 流式上传（推荐用于大文件，避免内存峰值）。
 *
 * 说明：
 * - 这里刻意不引入浏览器侧类型（如 `Blob`），让该包在服务端 tsconfig 下更稳定。
 */
export type StorageUploadBody = Buffer | string | Readable;

/**
 * `ensureBucket` 的返回结果。
 */
export type EnsureBucketResult = {
  /** 调用前 bucket 是否已经存在。 */
  exists: boolean;
  /** 本次调用是否创建了 bucket（存在则为 false）。 */
  created: boolean;
  /** bucket 名称（回显）。 */
  bucket: StorageBucketName;
};

/**
 * 上传对象入参。
 */
export type UploadObjectParams = {
  /** 对象 key。 */
  key: StorageObjectKey;
  /** 上传内容。 */
  body: StorageUploadBody;

  /**
   * MIME 类型（Content-Type），可选。
   *
   * 示例：`image/png`、`application/pdf`、`text/plain; charset=utf-8`
   */
  contentType?: string;

  /**
   * 内容长度（字节），可选。
   *
   * 说明：
   * - 某些 SDK/厂商在特定上传方式下需要该值；不填时可能由 SDK 自动计算或走 chunked 传输。
   */
  contentLength?: number;

  /**
   * 内容展示方式（Content-Disposition），可选。
   *
   * 示例：
   * - `inline`
   * - `attachment; filename="report.pdf"`
   */
  contentDisposition?: string;

  /**
   * 自定义元数据（key/value），可选。
   *
   * 注意：
   * - 不同厂商会使用不同的 header 前缀/命名规则（例如 `x-amz-meta-` 等），adapter 会负责映射。
   * - 元数据大小、字符集限制由厂商决定；尽量保持 key 简洁并控制总体大小。
   */
  metadata?: StorageObjectMetadata;
};

/**
 * 上传对象返回结果（最小回执）。
 *
 * 说明：
 * - 目前仅回传 `bucket` 与 `key`，不包含 ETag/版本号/校验和等信息；
 *   若业务侧需要这些字段，可以在后续迭代中扩展。
 */
export type UploadObjectResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key。 */
  key: StorageObjectKey;
};

/**
 * 下载对象入参。
 */
export type DownloadObjectParams = {
  /** 对象 key。 */
  key: StorageObjectKey;
};

/**
 * 下载对象结果（流式）。
 */
export type DownloadObjectResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key。 */
  key: StorageObjectKey;

  /**
   * 对象内容（Node.js 可读流）。
   *
   * 使用建议：
   * - 直接 pipe 到文件或 HTTP 响应，避免一次性读入内存：
   *   `body.pipe(fs.createWriteStream(...))`
   */
  body: Readable;
};

/**
 * 删除单个对象入参。
 */
export type DeleteObjectParams = {
  /** 对象 key。 */
  key: StorageObjectKey;
};

/**
 * 删除单个对象结果（最小回执）。
 */
export type DeleteObjectResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key。 */
  key: StorageObjectKey;
};

/**
 * 批量删除对象入参（按 key 列表）。
 */
export type DeleteObjectsParams = {
  /** 要删除的对象 key 列表。 */
  keys: StorageObjectKey[];
};

/**
 * 批量删除对象结果。
 */
export type DeleteObjectsResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 删除失败的对象 key 列表。 */
  keys: StorageObjectKey[];
};

/**
 * 生成上传预签名 URL 入参。
 */
export type PresignedPutUrlParams = {
  /** 对象 key。 */
  key: StorageObjectKey;
  /** 过期时间（秒），可选，默认 1800 秒。 */
  expiredSeconds?: number;

  /**
   * MIME 类型（Content-Type），可选。
   *
   * 示例：`image/png`、`application/pdf`、`text/plain; charset=utf-8`
   */
  contentType?: string;

  /**
   * 自定义元数据（key/value），可选。
   *
   * 注意：
   * - 不同厂商会使用不同的 header 前缀/命名规则（例如 `x-amz-meta-` 等），adapter 会负责映射。
   * - 元数据大小、字符集限制由厂商决定；尽量保持 key 简洁并控制总体大小。
   */
  metadata?: StorageObjectMetadata;
};

/**
 * 生成上传预签名 URL 结果。
 */
export type PresignedPutUrlResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key。 */
  key: StorageObjectKey;
  /** 可直接访问的临时 URL。 */
  url: string;
  /**
   * 与本次 PUT 直传相关的“需要带上的 header”集合。
   *
   * 说明：
   * - 不同厂商对自定义元数据的 header 前缀不同（例如 S3 是 `x-amz-meta-*`，COS 是 `x-cos-meta-*`，OSS 是 `x-oss-meta-*`）。
   * - 为了让调用方在前端直传时更容易使用，这里统一通过该字段返回 adapter 期望的 header key/value。
   *
   * 注意：
   * - 该字段名历史原因沿用 `metadata`，但语义更接近“headers”而非纯业务元数据。
   */
  metadata: Record<string, string>;
};

/**
 * 生成下载预签名 URL 入参。
 */
export type PresignedGetUrlParams = {
  /** 对象 key。 */
  key: StorageObjectKey;
  /** 过期时间（秒），可选，默认 1800 秒。 */
  expiredSeconds?: number;
};

/**
 * 生成下载预签名 URL 结果。
 */
export type PresignedGetUrlResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key。 */
  key: StorageObjectKey;
  /** 可直接访问的临时 URL。 */
  url: string;
};

/**
 * 生成公共对象的访问 URL 入参。
 */
export type GeneratePublicGetUrlParams = {
  /** 对象 key。 */
  key: StorageObjectKey;
};

/**
 * 生成公共对象的访问 URL 结果。
 */
export type GeneratePublicGetUrlResult = {
  /** 可直接访问的公共 URL。 */
  url: string;
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key。 */
  key: StorageObjectKey;
};

/**
 * 列表查询入参（按前缀过滤）。
 *
 * 注意：
 * - 当前类型未包含分页参数；当对象数量很多时，adapter 可能需要自行分页并在内部合并结果（或未来扩展此类型）。
 */
export type ListObjectsParams = {
  /**
   * 前缀过滤（prefix），可选。
   *
   * 示例：`team/123/` 会列出该前缀下的所有对象 key。
   */
  prefix?: string;
};

/**
 * 列表查询结果（仅返回 key 列表）。
 */
export type ListObjectsResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key 列表。 */
  keys: StorageObjectKey[];
};

/**
 * 复制对象入参。
 */
export type CopyObjectParams = {
  /** 源对象 key。 */
  sourceKey: StorageObjectKey;
  /** 目标对象 key。 */
  targetKey: StorageObjectKey;
};

/**
 * 复制对象结果。
 */
export type CopyObjectResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 源对象 key。 */
  sourceKey: StorageObjectKey;
  /** 目标对象 key。 */
  targetKey: StorageObjectKey;
};

/**
 * 获取对象元数据入参。
 */
export type GetObjectMetadataParams = {
  /** 对象 key。 */
  key: StorageObjectKey;
};

/**
 * 获取对象元数据结果。
 */
export type GetObjectMetadataResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key。 */
  key: StorageObjectKey;
  /** 元数据。 */
  metadata: StorageObjectMetadata;
  /** MIME 类型（Content-Type）。 */
  contentType?: string;
  /** 内容长度（字节）。 */
  contentLength?: number;
  /** ETag。 */
  etag?: string;
};

/**
 * 按前缀批量删除入参（高危）。
 *
 * 说明：
 * - 通常实现方式是：先按 prefix 列出对象，再分批删除。
 * - 这可能会产生较多 API 调用与费用，并且在对象数很大时耗时较长。
 */
export type DeleteObjectsByPrefixParams = {
  /**
   * 前缀（prefix），必须为**非空字符串**。
   *
   * 安全原因：
   * - 若允许空字符串，等价于删除整个 bucket 内所有对象，风险极高。
   *
   * 建议：
   * - 使用强业务隔离前缀，例如：`team/{teamId}/`、`dataset/{datasetId}/`。
   */
  prefix: string;
};

/**
 * 判断对象是否存在入参。
 */
export type ExistsObjectParams = {
  /** 对象 key。 */
  key: StorageObjectKey;
};

/**
 * 判断对象是否存在结果。
 */
export type ExistsObjectResult = {
  /** bucket 名称。 */
  bucket: StorageBucketName;
  /** 对象 key。 */
  key: StorageObjectKey;
  /** 对象是否存在。 */
  exists: boolean;
};

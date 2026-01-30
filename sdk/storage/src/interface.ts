import type {
  DeleteObjectParams,
  DeleteObjectResult,
  DeleteObjectsParams,
  DeleteObjectsResult,
  DeleteObjectsByPrefixParams,
  DownloadObjectParams,
  DownloadObjectResult,
  EnsureBucketResult,
  GetObjectMetadataParams,
  GetObjectMetadataResult,
  ListObjectsParams,
  ListObjectsResult,
  PresignedPutUrlParams,
  PresignedPutUrlResult,
  UploadObjectParams,
  UploadObjectResult,
  ExistsObjectParams,
  ExistsObjectResult,
  PresignedGetUrlParams,
  PresignedGetUrlResult,
  CopyObjectParams,
  CopyObjectResult,
  GeneratePublicGetUrlParams,
  GeneratePublicGetUrlResult
} from './types';

/**
 * 通用存储配置（与具体云厂商无关）。
 *
 * 说明：
 * - 本包的适配器以「对象存储」为抽象（S3/OSS/COS/MinIO 等）。
 * - `bucket` / `region` / `credentials` 是大多数厂商的最小必填集合。
 * - `endpoint` 用于 S3 兼容协议的自定义域名/私有部署地址等场景。
 *
 * 注意：
 * - 不同厂商对 `region` 的含义略有差异（有的会叫作 `region`，有的叫 `location`），这里统一命名为 `region`，
 *   由各 adapter 在内部做映射或直传。
 */
export interface ICommonStorageOptions {
  /**
   * 存储桶名称（Bucket）。
   *
   * - 一般全局唯一（取决于厂商），建议使用小写字母/数字/短横线组合。
   * - 对于已存在的 bucket：此处填写目标 bucket 名称即可。
   */
  bucket: string;

  /**
   * 区域（Region / Location）。
   *
   * - AWS: 例如 `ap-northeast-1`
   * - 腾讯云 COS: 例如 `ap-guangzhou`
   * - 阿里云 OSS: 例如 `oss-cn-hangzhou`（具体取值以厂商为准）
   */
  region: string;

  /**
   * 访问凭证（AK/SK）。
   *
   * 注意：
   * - 不同厂商字段命名不同，这里统一为 `accessKeyId` / `secretAccessKey`。
   * - 强烈建议从环境变量/密钥管理服务中读取，不要硬编码在仓库里。
   */
  credentials: {
    /** AccessKeyId / SecretId / AK */
    accessKeyId: string;
    /** SecretAccessKey / SecretKey / SK */
    secretAccessKey: string;
  };

  /**
   * 公共访问时额外添加的子路径，可选。
   *
   * 说明：
   * - 用于在公共访问时添加额外的前缀，例如 `/sub-path`。
   */
  publicAccessExtraSubPath?: string;
}

/**
 * AWS S3 兼容协议的存储配置。
 *
 * 适用范围：
 * - AWS S3
 * - MinIO（以及其他兼容 S3 的对象存储）
 *
 * 设计：
 * - 通过 `vendor` 做判别联合（discriminated union），便于在运行时和类型层面区分不同厂商配置。
 */
export interface IAwsS3CompatibleStorageOptions extends ICommonStorageOptions {
  /**
   * 存储厂商标识（S3 兼容系）。
   *
   * - `aws-s3`: AWS S3
   * - `minio`: MinIO（S3 协议兼容）
   */
  vendor: 'aws-s3' | 'minio';

  /**
   * 自定义服务端点（Endpoint），可选。
   *
   * 常见用途：
   * - MinIO / 私有 S3 兼容服务：`http(s)://host:port`
   * - 某些厂商的加速域名、内网域名等
   *
   * 注意：是否需要带协议、端口、路径取决于具体 adapter 的实现。
   */
  endpoint: string;

  /**
   * 是否强制使用 Path-Style 访问（`/{bucket}/{key}`），可选。
   *
   * 背景：
   * - S3 支持两种寻址方式：virtual-hosted-style（`{bucket}.endpoint/{key}`）和 path-style（`endpoint/{bucket}/{key}`）。
   * - 一些自建/本地化服务（或特定网络环境）对 virtual-hosted-style 支持不完整，此时可能需要开启。
   */
  forcePathStyle?: boolean;

  /**
   * 最大重试次数，可选。
   *
   * 说明：
   * - 仅影响 adapter 内部使用的 SDK 请求重试策略（如果 adapter 支持）。
   * - 若不设置，通常由 SDK 使用默认值。
   */
  maxRetries?: number;
}

/**
 * 阿里云 OSS 存储配置。
 */
export interface IOssStorageOptions extends ICommonStorageOptions {
  /** 存储厂商标识（OSS）。 */
  vendor: 'oss';

  /**
   * 是否使用自定义域名（CNAME），可选。
   *
   * - 开启后通常会影响 endpoint/host 的拼接方式。
   * - 具体行为取决于 OSS SDK 与 adapter 实现。
   */
  cname?: boolean;

  /**
   * 自定义服务端点（Endpoint），可选。
   *
   * 常见用途：
   * - MinIO / 私有 S3 兼容服务：`http(s)://host:port`
   * - 某些厂商的加速域名、内网域名等
   *
   * 注意：是否需要带协议、端口、路径取决于具体 adapter 的实现。
   */
  endpoint?: string;

  /**
   * 是否使用 HTTPS 协议，可选。
   *
   * 说明：
   * - 默认使用 HTTPS 协议。
   * - 如果设置为 false，则使用 HTTP 协议。
   */
  secure?: boolean;

  /**
   * 是否启用代理，可选。
   */
  enableProxy?: boolean;

  /**
   * 是否走内网（internal endpoint），可选。
   *
   * - 在同地域云内网环境可显著降低延迟与流量费用。
   * - 若设置为 true，adapter 可能会自动选择 internal endpoint。
   */
  internal?: boolean;
}

/**
 * 腾讯云 COS 存储配置。
 */
export interface ICosStorageOptions extends ICommonStorageOptions {
  /** 存储厂商标识（COS）。 */
  vendor: 'cos';

  /**
   * 请求协议，可选。
   *
   * - `https:` 为默认推荐
   * - 某些内网/测试环境可能使用 `http:`
   */
  protocol?: 'http:' | 'https:';

  /**
   * 是否启用全球加速，可选。
   *
   * 说明：
   * - 仅当 COS 账号/桶已开通加速能力时才有意义。
   * - 开启后 endpoint/域名可能会发生变化（由 adapter 处理）。
   */
  useAccelerate?: boolean;

  /**
   * 自定义域名，可选。
   *
   * 说明：
   * - 用于替代默认的域名，例如 `https://{bucket}.cos.${region}.myqcloud.com`。
   * - 通常用于某些厂商的私有化部署环境。
   */
  domain?: string;

  /**
   * 代理，可选。
   *
   * 说明：
   * - 用于 HTTP 代理访问，例如 `http://127.0.0.1:8080`。
   */
  proxy?: string;
}

/**
 * 百度 BOS 存储配置（预留）。
 *
 * 说明：
 * - 当前 `IStorageOptions` 并未包含该类型，可能尚未完整实现/接入。
 * - 先保留接口便于后续扩展。
 */
export interface IBosStorageOptions extends ICommonStorageOptions {
  /** 存储厂商标识（BOS）。 */
  vendor: 'bos';
}

/**
 * 存储配置联合类型（判别联合）。
 *
 * 用法：
 * - 根据 `vendor` 字段区分不同厂商配置，adapter 工厂函数通常也会基于该字段选择实现。
 *
 * 注意：
 * - 当前仅包含 `aws-s3`/`minio`/`oss`/`cos`；若后续接入新厂商，需要在此处补齐联合成员。
 */
export type IStorageOptions =
  | IAwsS3CompatibleStorageOptions
  | IOssStorageOptions
  | ICosStorageOptions;

/**
 * 统一的对象存储能力接口（vendor-agnostic）。
 *
 * 约定：
 * - `key` 通常表示对象在 bucket 内的路径（例如 `a/b/c.txt`），由调用方自行约定命名规则。
 * - 所有方法都应当是幂等或尽可能接近幂等（例如删除不存在的对象不应抛出致命错误），以便业务层重试。
 */
export interface IStorage {
  bucketName: string;

  /**
   * 确保存储桶存在；若不存在则**可能**尝试创建（取决于 vendor 与账号权限）。
   *
   * 返回值说明：
   * - `exists`: 调用前 bucket 是否存在
   * - `created`: 本次调用是否创建了 bucket
   *
   * 建议：
   * - 对于 OSS/COS 等厂商，很多团队更倾向于在控制台/基础设施层面创建 bucket（权限/策略/生命周期等更可控），
   *   应用侧仅做存在性校验即可（bucket 不存在时会抛出底层 SDK 错误）。
   */
  ensureBucket(): Promise<EnsureBucketResult>;

  /**
   * 判断对象是否存在。
   *
   * 返回值说明：
   * - `exists`: 对象是否存在
   */
  checkObjectExists(params: ExistsObjectParams): Promise<ExistsObjectResult>;

  /**
   * 上传对象到 bucket。
   *
   * 典型用法：
   * - 上传文件内容（Buffer/Readable）
   * - 上传文本（string）
   *
   * 注意：
   * - `contentType`/`contentDisposition`/`metadata` 会映射为不同厂商的 HTTP 头或元数据字段，adapter 负责兼容。
   */
  uploadObject(params: UploadObjectParams): Promise<UploadObjectResult>;

  /**
   * 下载对象（以 Node.js `Readable` 流形式返回）。
   *
   * 说明：
   * - 适合大文件流式读取，避免一次性加载到内存。
   * - 调用方负责消费/关闭流（正常读取结束会自动关闭）。
   */
  downloadObject(params: DownloadObjectParams): Promise<DownloadObjectResult>;

  /**
   * 删除单个对象（按 key）。
   *
   * 建议：
   * - 作为幂等操作处理：若对象不存在，最好仍返回成功（由 adapter 决定具体行为）。
   */
  deleteObject(params: DeleteObjectParams): Promise<DeleteObjectResult>;

  /**
   * 根据多个 key 批量删除对象。
   *
   * 注意：
   * - 各厂商对单次批量删除的最大数量限制不同，adapter 可能需要分批处理。
   * - 返回的 `deleted` 通常只包含实际删除/确认删除的 key。
   */
  deleteObjectsByMultiKeys(params: DeleteObjectsParams): Promise<DeleteObjectsResult>;

  /**
   * 根据前缀批量删除对象（危险操作）。
   *
   * 安全建议：
   * - `prefix` 必须是非空字符串，且建议包含业务域前缀（例如 `team/{teamId}/`），避免误删整个 bucket。
   * - 对于大规模删除，adapter 可能会先 list 再 delete，耗时与费用需评估。
   *
   * 注意：
   * - 理论上可以使用 `this.listObjects` 然后 `this.deleteObjectsByMultiKeys`
   *   但是这样可能会产生不必要的内存占用问题，所以这里单独实现了一个方法
   */
  deleteObjectsByPrefix(params: DeleteObjectsByPrefixParams): Promise<DeleteObjectsResult>;

  /**
   * 生成对象的上传预签名 URL（Presigned URL）。
   *
   * 用途：
   * - 前端直传（PUT）
   *
   * 注意：
   * - 过期时间、签名算法、header 约束等通常由 adapter 或其底层 SDK 决定。
   * - 返回值中的 `metadata` 字段语义更接近“直传时需要附带的 headers”（不同厂商前缀不同，如 `x-oss-meta-*` / `x-cos-meta-*`）。
   *   字段名因历史原因沿用 `metadata`。
   */
  generatePresignedPutUrl(params: PresignedPutUrlParams): Promise<PresignedPutUrlResult>;

  /**
   * 生成对象的下载预签名 URL（Presigned URL）。
   *
   * 用途：
   * - 临时授权下载（GET）
   */
  generatePresignedGetUrl(params: PresignedGetUrlParams): Promise<PresignedGetUrlResult>;

  /**
   * 生成公共对象的访问 URL。
   */
  generatePublicGetUrl(params: GeneratePublicGetUrlParams): GeneratePublicGetUrlResult;

  /**
   * 列出对象 key（可按前缀过滤）。
   *
   * 注意：
   * - 当前返回结构只包含 key 列表，未包含分页/marker/continuationToken 等信息；
   *   若业务需要大规模遍历，应扩展 `ListObjectsParams/Result` 支持分页与更多元数据。
   * - `prefix` 为可选；不传则表示列出整个 bucket 内对象（注意对象很多时可能会很慢/很贵）。
   * - 不要用 listObjects + deleteObjectsByMultiKeys 来实现“按前缀删除”：批量删除单次最多 1000 个对象，且 list 结果量可能很大；
   *   请使用 `deleteObjectsByPrefix`（adapter 会在内部分页与分批删除）。
   */
  listObjects(params: ListObjectsParams): Promise<ListObjectsResult>;

  /**
   * 复制对象。
   */
  copyObjectInSelfBucket(params: CopyObjectParams): Promise<CopyObjectResult>;

  /**
   * 获取对象元数据（Metadata）。
   *
   * 说明：
   * - 元数据通常包含用户自定义 metadata 以及部分系统字段（取决于 adapter 的实现）。
   * - 不同厂商会对 metadata 的 key 前缀、大小写、可用字符做限制，调用方应尽量使用简单的 ASCII key。
   */
  getObjectMetadata(params: GetObjectMetadataParams): Promise<GetObjectMetadataResult>;

  /**
   * 资源清理/连接释放。
   *
   * 说明：
   * - 某些 SDK 会维护连接池或后台任务，业务在进程退出前可调用以更快释放资源。
   * - 若 adapter 无需清理，应实现为空操作（resolved Promise）。
   */
  destroy(): Promise<void>;
}

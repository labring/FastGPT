/** 外部文件权限同步的调优常量。 */

/** 并发向外部 API 拉取文件详情的上限：既压住对方限流，又不至于 4w 节点纯串行。 */
export const PERMISSION_FETCH_CONCURRENCY = 10;

/** 单次文件详情请求超时。超时按该节点失败处理（跳过，不中止整轮）。 */
export const PERMISSION_FETCH_TIMEOUT_MS = 30_000;

/** 权限同步作业的整体超时（与每日同步作业同为 60 分钟）。 */
export const DATASET_PERMISSION_SYNC_JOB_TIMEOUT_MS = 60 * 60 * 1000;

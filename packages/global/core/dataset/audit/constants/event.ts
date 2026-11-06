/**
 * 知识库审计事件；持久化复用 support/user/audit 的通用审计框架。
 *
 * value 使用点分小写资源路径和动作名，直接写入 operationLogs.event；修改已有值会影响历史日志展示。
 */
export enum DatasetAuditEventEnum {
  /** 创建集合；导入文件按「一个文件一条日志」逐条写入。 */
  DATASET_COLLECTION_CREATE = 'dataset.collection.create',
  /** 更新集合对象属性；一次请求命中多项变更时按变更逐条写入。 */
  DATASET_COLLECTION_UPDATE = 'dataset.collection.update',
  DATASET_COLLECTION_EXPORT = 'dataset.collection.export',
  /** 同步集合：只记录发起的同步操作，不区分同步结果。 */
  DATASET_COLLECTION_SYNC = 'dataset.collection.sync',
  DATASET_COLLECTION_TAG_ADD = 'dataset.collection.tag.add',
  DATASET_COLLECTION_TAG_REMOVE = 'dataset.collection.tag.remove',
  /** 集合恢复权限继承的独立事件；上级可能是父目录或知识库，与通用资源恢复继承事件分开记录。 */
  DATASET_COLLECTION_PERMISSION_INHERITANCE_RESUME = 'dataset.collection.permission.inheritance_resume',
  /** 修改知识库配置；每个实际变化的配置项写一条日志，不做多字段合并。 */
  DATASET_CONFIG_UPDATE = 'dataset.config.update',
  /** 创建知识库标签定义（不是给集合打标签）。 */
  DATASET_TAG_CREATE = 'dataset.tag.create',
  /** 重命名知识库标签定义；只有名称真的变化才写。 */
  DATASET_TAG_RENAME = 'dataset.tag.rename',
  /** 删除知识库标签定义。 */
  DATASET_TAG_DELETE = 'dataset.tag.delete',
  /** 知识库级全部重试：不指定集合，重试该知识库下所有失败训练任务。 */
  DATASET_TRAINING_RETRY = 'dataset.training.retry',
  /** 集合级全部重试：重试指定集合下的所有失败训练任务。 */
  DATASET_COLLECTION_TRAINING_RETRY = 'dataset.collection.training.retry',
  /** 单个训练任务重试；训练任务归属于集合，因此用 training.task 表示单个任务。 */
  DATASET_TRAINING_TASK_RETRY = 'dataset.training.task.retry',
  /** 清理训练记录（删除训练任务）；一次请求只删除集合内的一条训练记录。 */
  DATASET_TRAINING_RECORD_DELETE = 'dataset.training.record.delete',
  /** 切换索引模型并重建索引；影响整个知识库。 */
  DATASET_INDEX_REBUILD = 'dataset.index.rebuild'
}

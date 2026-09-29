/** 旧版本系统模型表，只用于首次启动迁移和回滚，不注册 Mongoose Schema。 */
export const LegacySystemModelCollectionName = 'system_models';

/** 当前版本所有模型实例的唯一持久化表。 */
export const AIModelCollectionName = 'ai_models';

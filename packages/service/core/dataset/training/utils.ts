/** 恢复可领取状态；是否重新启用 TTL 由业务入口明确决定，默认保留原过期策略。 */
export const getTrainingTaskReadyUpdate = ({
  restoreExpiration = false
}: { restoreExpiration?: boolean } = {}) => ({
  $set: {
    retryCount: 3,
    lockTime: new Date(0),
    ...(restoreExpiration ? { expireAt: new Date() } : {})
  },
  $unset: { errorMsg: '' }
});

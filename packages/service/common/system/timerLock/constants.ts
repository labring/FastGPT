export enum TimerIdEnum {
  checkInValidDatasetFiles = 'checkInValidDatasetFiles',
  checkInvalidDatasetData = 'checkInvalidDatasetData',
  checkInvalidVector = 'checkInvalidVector',
  clearExpiredSubPlan = 'clearExpiredSubPlan',
  updateStandardPlan = 'updateStandardPlan',
  scheduleTriggerApp = 'scheduleTriggerApp'
}

export const timerIdMap = {
  [TimerIdEnum.checkInValidDatasetFiles]: 'checkInValidDatasetFiles',
  [TimerIdEnum.checkInvalidDatasetData]: 'checkInvalidDatasetData',
  [TimerIdEnum.checkInvalidVector]: 'checkInvalidVector',
  [TimerIdEnum.clearExpiredSubPlan]: 'clearExpiredSubPlan',
  [TimerIdEnum.updateStandardPlan]: 'updateStandardPlan',
  [TimerIdEnum.scheduleTriggerApp]: 'scheduleTriggerApp'
};

export enum LockNotificationEnum {
  NotificationExpire = 'notification_expire',
  NotificationFreeClean = 'notification_free_clean',
  NotificationLackOfPoints = 'notification_lack_of_points'
}

export type LockType = `${LockNotificationEnum}`;

// add a new type enum example:
// export enum ExampleLockEnum {
//    ExampleLockType1 = 'example_lock_type1'
// }
//
// export type LockType = `${NotificationLockEnum}` | `${ExampleLockEnum}`

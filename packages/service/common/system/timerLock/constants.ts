export enum TimerIdEnum {
  checkExpiredFiles = 'checkExpiredFiles',
  checkInvalidDatasetData = 'checkInvalidDatasetData',
  checkInvalidVector = 'checkInvalidVector',
  clearExpiredSubPlan = 'clearExpiredSubPlan',
  updateStandardPlan = 'updateStandardPlan',
  scheduleTriggerApp = 'scheduleTriggerApp',
  notification = 'notification',

  clearExpiredRawTextBuffer = 'clearExpiredRawTextBuffer',
  clearExpiredDatasetImage = 'clearExpiredDatasetImage'
}

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

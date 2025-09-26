import { type LifecycleRule, type LifecycleConfig } from 'minio';

export function createLifeCycleConfig(rule: LifecycleRule): LifecycleConfig {
  return {
    Rule: [rule]
  };
}

export function assembleLifeCycleConfigs(...configs: LifecycleConfig[]): LifecycleConfig {
  if (configs.length === 0) return { Rule: [] };
  return {
    Rule: configs.flatMap((config) => config.Rule)
  };
}

export const lifecycleOfTemporaryAvatars = createLifeCycleConfig({
  ID: 'Temporary Avatars Rule',
  Prefix: 'temp/avatar/',
  Status: 'Enabled',
  Expiration: {
    Days: 1
  }
});

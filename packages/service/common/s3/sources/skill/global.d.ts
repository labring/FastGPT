import type { S3SkillSource } from './index';

declare global {
  var skillBucket: S3SkillSource;
}

export {};

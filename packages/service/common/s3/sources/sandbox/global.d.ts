import type { S3SandboxSource } from '.';

declare global {
  var sandboxBucket: S3SandboxSource;
}

export {};

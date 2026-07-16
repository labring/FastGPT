import type { UploadConstraints } from '../contracts/type';
import type { UploadFileHint, UploadPolicy } from '../uploadPolicy/type';
import {
  createUploadPolicy,
  detectUploadFileEvidence,
  getUploadInspectBytes as getPolicyUploadInspectBytes,
  resolveUploadFile
} from '../uploadPolicy/service';

export const getUploadInspectBytes = (
  filenameOrParams?:
    | string
    | {
        hint?: UploadFileHint;
        policy?: UploadPolicy;
      }
) => {
  if (typeof filenameOrParams === 'string' || filenameOrParams === undefined) {
    return getPolicyUploadInspectBytes({
      hint: filenameOrParams ? { filename: filenameOrParams } : undefined
    });
  }

  return getPolicyUploadInspectBytes(filenameOrParams);
};

/**
 * 校验上传文件内容并返回最终写入 metadata 的文件信息。
 *
 * 兼容旧调用方的 `filename + uploadConstraints` 入参；新短上传链路应优先传
 * `fileHint + uploadPolicy`，避免把客户端 hint、服务端策略和内容 evidence 混在一起。
 */
export async function validateUploadFile({
  buffer,
  filename,
  uploadConstraints,
  uploadPolicy,
  fileHint
}: {
  buffer: Buffer;
  filename?: string;
  uploadConstraints: UploadConstraints;
  uploadPolicy?: UploadPolicy;
  fileHint?: UploadFileHint;
}) {
  const hint = fileHint || {
    filename: filename || 'file'
  };
  const policy =
    uploadPolicy ||
    createUploadPolicy({
      hint,
      uploadConstraints
    });
  const evidence = await detectUploadFileEvidence({ buffer });

  return resolveUploadFile({
    hint,
    policy,
    evidence
  });
}

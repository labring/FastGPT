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
 * 新短上传链路传入已经固定的 `fileHint + uploadPolicy`；`uploadConstraints` 仅保留给
 * 旧的直接调用方现场构建策略，不作为 upload session 或 proxy payload 的字段。
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
  uploadConstraints?: UploadConstraints;
  uploadPolicy?: UploadPolicy;
  fileHint?: UploadFileHint;
}) {
  const hint = fileHint || {
    filename: filename || 'file'
  };
  const policy =
    uploadPolicy ??
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

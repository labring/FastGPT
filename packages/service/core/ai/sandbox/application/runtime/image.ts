import type { SandboxImageConfigType } from '@fastgpt/global/core/ai/sandbox/type';
import type { ImageSpec } from '../../infrastructure/opensandbox/type';
import { parseImageSpec } from '../../infrastructure/opensandbox/utils';

/**
 * 把 provider SDK 接受的字符串或对象镜像统一成 repository/tag。
 *
 * 统一复用 `parseImageSpec` 处理 registry 端口与 `@sha256:` digest，同时保留 tag 与 digest（如 `v1@sha256:...`）。
 */
export const normalizeSandboxImage = (
  image?: (SandboxImageConfigType & { digest?: string }) | ImageSpec | string | null
): SandboxImageConfigType | undefined => {
  const formatNormalizedTag = (baseTag: string, digest?: string) => {
    if (!digest) return baseTag;
    if (!baseTag) return `@${digest}`;
    return baseTag.includes('@') ? baseTag : `${baseTag}@${digest}`;
  };

  if (typeof image === 'string') {
    const parsed = parseImageSpec(image);
    if (!parsed.repository) return;
    return {
      repository: parsed.repository,
      tag: formatNormalizedTag(parsed.tag ?? '', parsed.digest)
    };
  }
  if (!image?.repository) return;

  const parsedRepo = parseImageSpec(image.repository);
  const baseTag = image.tag || parsedRepo.tag || '';
  const digest = image.digest || parsedRepo.digest;

  return {
    repository: parsedRepo.repository,
    tag: formatNormalizedTag(baseTag, digest)
  };
};

/** 比较目标 runtime 与实例记录的 repository/tag。 */
export const isSandboxRuntimeImageMatched = (
  runtimeImage:
    | (SandboxImageConfigType & { digest?: string })
    | ImageSpec
    | string
    | null
    | undefined,
  existingImage?: (SandboxImageConfigType & { digest?: string }) | ImageSpec | string | null
) => {
  const normalizedRuntimeImage = normalizeSandboxImage(runtimeImage);
  const normalizedExistingImage = normalizeSandboxImage(existingImage);
  return (
    !normalizedRuntimeImage ||
    (!!normalizedExistingImage &&
      normalizedExistingImage.repository === normalizedRuntimeImage.repository &&
      (normalizedExistingImage.tag ?? '') === (normalizedRuntimeImage.tag ?? ''))
  );
};

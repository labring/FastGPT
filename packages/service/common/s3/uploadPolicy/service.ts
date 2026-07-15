import { fileTypeFromBuffer } from 'file-type';
import { S3ErrEnum } from '@fastgpt/global/common/error/code/s3';
import { serviceEnv } from '../../../env';
import type { UploadConstraintsInput } from '../contracts/type';
import { DEFAULT_CONTENT_TYPE, normalizeMimeType, resolveMimeType } from '../utils/mime';
import { isLikelyTextBuffer } from '../../file/read/text';
import {
  createUploadExtensionRulesFromAllowedExtensions,
  decodeFileName,
  defaultInspectBytes,
  detectOfficeDocumentMime,
  getFilenameExtension,
  getOfficeZipFormatByExtension,
  isTextLikeMime,
  mimesMatchForUpload,
  normalizeAllowedExtensions,
  normalizeFileExtension,
  normalizeUploadExtensionRules,
  officeZipInspectBytes,
  replaceFilenameExtension,
  resolveAllowedExtensionForMime,
  resolveAllowedMimeTypes,
  resolveExtensionForMime,
  resolveExtensionRule
} from './utils';
import type { ResolvedUploadFile, UploadFileEvidence, UploadFileHint, UploadPolicy } from './type';

const preferredTextFallbackExtensions = ['.txt', '.md', '.csv', '.json', '.html'];

const normalizeUploadHint = (hint: UploadFileHint): UploadFileHint => {
  const filename = decodeFileName(hint.declaredFilename || hint.filename);
  return {
    ...hint,
    filename,
    ...(hint.declaredExtension
      ? { declaredExtension: normalizeFileExtension(hint.declaredExtension) }
      : {}),
    ...(hint.declaredFilename ? { declaredFilename: decodeFileName(hint.declaredFilename) } : {}),
    ...(hint.contentType ? { contentType: normalizeMimeType(hint.contentType, '') } : {})
  };
};

const resolveDeclaredExtension = (hint: UploadFileHint) => {
  const declaredFilenameExtension = getFilenameExtension(hint.declaredFilename);
  return declaredFilenameExtension || normalizeFileExtension(hint.declaredExtension);
};

const resolveTextFallbackExtension = (allowedExtensions: string[]) => {
  return (
    preferredTextFallbackExtensions.find((extension) => allowedExtensions.includes(extension)) ||
    allowedExtensions.find((extension) => {
      const mime = resolveMimeType([extension], '');
      return Boolean(mime) && isTextLikeMime(mime);
    }) ||
    ''
  );
};

const resolveDefaultContentType = ({
  hint,
  filename,
  explicitExtension,
  uploadConstraints,
  allowedExtensions
}: {
  hint: UploadFileHint;
  filename: string;
  explicitExtension: string;
  uploadConstraints?: UploadConstraintsInput;
  allowedExtensions: string[];
}) => {
  if (uploadConstraints?.defaultContentType) {
    return normalizeMimeType(uploadConstraints.defaultContentType, DEFAULT_CONTENT_TYPE);
  }

  const hintContentType = normalizeMimeType(hint.contentType, '');
  if (hintContentType) {
    const hintedExtension = resolveExtensionForMime({
      mime: hintContentType,
      allowedExtensions
    });
    if (
      !allowedExtensions.length ||
      (hintedExtension && allowedExtensions.includes(hintedExtension))
    ) {
      return hintContentType;
    }
  }

  return normalizeMimeType(
    resolveMimeType([filename, explicitExtension], DEFAULT_CONTENT_TYPE),
    DEFAULT_CONTENT_TYPE
  );
};

const createFallbackExtension = ({
  hint,
  explicitExtension,
  allowedExtensions,
  defaultContentType
}: {
  hint: UploadFileHint;
  explicitExtension: string;
  allowedExtensions: string[];
  defaultContentType: string;
}) => {
  if (explicitExtension) return explicitExtension;

  const hintExtension = resolveExtensionForMime({
    mime: hint.contentType,
    allowedExtensions
  });
  if (hintExtension && (!allowedExtensions.length || allowedExtensions.includes(hintExtension))) {
    return hintExtension;
  }

  const defaultExtension = resolveExtensionForMime({
    mime: defaultContentType,
    allowedExtensions
  });
  if (
    defaultExtension &&
    (!allowedExtensions.length || allowedExtensions.includes(defaultExtension))
  ) {
    return defaultExtension;
  }

  return '';
};

/**
 * 构建服务端上传策略。预签阶段只校验明确违反 policy 的后缀，不因为缺后缀拒绝；
 * 缺失的信息会留到上传阶段通过 evidence 或 declared hint 决策。
 */
export const createUploadPolicy = ({
  hint,
  uploadConstraints
}: {
  hint: UploadFileHint;
  uploadConstraints?: UploadConstraintsInput;
}): UploadPolicy => {
  const normalizedHint = normalizeUploadHint(hint);
  const filename = normalizedHint.filename;
  const filenameExtension = getFilenameExtension(filename);
  const declaredExtension = resolveDeclaredExtension(normalizedHint);
  const explicitExtension = filenameExtension || declaredExtension;
  const allowedExtensions = normalizeAllowedExtensions(uploadConstraints?.allowedExtensions);

  if (
    allowedExtensions.length > 0 &&
    explicitExtension &&
    !allowedExtensions.includes(explicitExtension)
  ) {
    throw new Error(S3ErrEnum.invalidUploadFileType);
  }

  const baseRules = (() => {
    const normalizedRules = normalizeUploadExtensionRules(uploadConstraints?.extensionRules);
    if (!allowedExtensions.length) return normalizedRules;

    const ruleMap = new Map(normalizedRules.map((rule) => [rule.extension, rule]));
    for (const rule of createUploadExtensionRulesFromAllowedExtensions(allowedExtensions)) {
      if (!ruleMap.has(rule.extension)) {
        ruleMap.set(rule.extension, rule);
      }
    }
    return Array.from(ruleMap.values()).filter((rule) =>
      allowedExtensions.includes(rule.extension)
    );
  })();

  const explicitRule = explicitExtension
    ? baseRules.find((rule) => rule.extension === explicitExtension)
    : undefined;
  const defaultContentType =
    explicitRule?.verification === 'opaque'
      ? DEFAULT_CONTENT_TYPE
      : resolveDefaultContentType({
          hint: normalizedHint,
          filename,
          explicitExtension,
          uploadConstraints,
          allowedExtensions
        });
  const fallbackExtension = createFallbackExtension({
    hint: normalizedHint,
    explicitExtension,
    allowedExtensions,
    defaultContentType
  });
  const textFallbackExtension = resolveTextFallbackExtension(allowedExtensions);

  return {
    defaultContentType,
    ...(allowedExtensions.length > 0 ? { allowedExtensions } : {}),
    ...(baseRules.length > 0 ? { extensionRules: baseRules } : {}),
    ...(allowedExtensions.length > 0
      ? { allowedMimeTypes: resolveAllowedMimeTypes(allowedExtensions) }
      : {}),
    ...(fallbackExtension ? { fallbackExtension } : {}),
    ...(!filenameExtension ? { allowMissingExtension: true } : {}),
    ...(textFallbackExtension ? { textFallbackExtension } : {})
  };
};

export const getUploadInspectBytes = ({
  hint,
  policy
}: {
  hint?: UploadFileHint;
  policy?: UploadPolicy;
} = {}) => {
  const filenameExtension = getFilenameExtension(hint?.declaredFilename || hint?.filename);
  const declaredExtension = normalizeFileExtension(hint?.declaredExtension);
  const possibleExtensions = [
    filenameExtension,
    declaredExtension,
    ...(policy?.allowedExtensions || [])
  ].filter(Boolean);
  const contentType = normalizeMimeType(hint?.contentType, '');

  if (possibleExtensions.some((extension) => getOfficeZipFormatByExtension(extension))) {
    return officeZipInspectBytes;
  }
  if (
    contentType &&
    ['wordprocessingml.document', 'spreadsheetml.sheet', 'presentationml.presentation'].some(
      (part) => contentType.includes(part)
    )
  ) {
    return officeZipInspectBytes;
  }

  return defaultInspectBytes;
};

export const detectUploadFileEvidence = async ({
  buffer
}: {
  buffer: Buffer;
}): Promise<UploadFileEvidence> => {
  const detected = await fileTypeFromBuffer(buffer).catch((error) => {
    if (error?.name === 'EndOfStreamError' || error?.message === 'End-Of-Stream') {
      return undefined;
    }
    throw error;
  });
  const officeFormat = detectOfficeDocumentMime({
    buffer,
    detectedMime: detected?.mime
  });
  const detectedMime = officeFormat?.mime || detected?.mime;

  if (detectedMime) {
    return {
      detectedMime,
      detectedExtension: officeFormat?.extension || normalizeFileExtension(detected?.ext),
      isTextLike: false,
      ...(officeFormat ? { officeExtension: officeFormat.extension } : {}),
      source: officeFormat ? 'office-zip' : 'magic'
    };
  }

  const isTextLike = isLikelyTextBuffer(buffer);
  return {
    isTextLike,
    source: isTextLike ? 'text' : 'unknown'
  };
};

const resolveExpectedMime = ({
  filename,
  extension,
  policy
}: {
  filename: string;
  extension: string;
  policy: UploadPolicy;
}) => {
  return resolveMimeType([filename, extension], policy.defaultContentType);
};

const resolveAcceptedFilename = ({
  filename,
  extension
}: {
  filename: string;
  extension: string;
}) => {
  return extension ? replaceFilenameExtension(filename, extension) : filename;
};

/**
 * 基于 policy、hint 和内容 evidence 做最终上传裁决。可内容验证类型必须由内容证明；
 * opaque/custom 类型必须由显式后缀或 declared hint 与服务端白名单共同证明。
 */
export const resolveUploadFile = ({
  hint,
  policy,
  evidence,
  skipFileTypeCheck = serviceEnv.SKIP_FILE_TYPE_CHECK
}: {
  hint: UploadFileHint;
  policy: UploadPolicy;
  evidence: UploadFileEvidence;
  skipFileTypeCheck?: boolean;
}): ResolvedUploadFile => {
  const normalizedHint = normalizeUploadHint(hint);
  const filename = normalizedHint.declaredFilename || normalizedHint.filename;
  const filenameExtension = getFilenameExtension(filename);
  const declaredExtension = resolveDeclaredExtension(normalizedHint);
  const explicitExtension = filenameExtension || declaredExtension;
  const allowedExtensions = normalizeAllowedExtensions(policy.allowedExtensions);

  if (
    allowedExtensions.length > 0 &&
    explicitExtension &&
    !allowedExtensions.includes(explicitExtension)
  ) {
    throw new Error(S3ErrEnum.invalidUploadFileType);
  }

  const explicitRule = resolveExtensionRule({ extension: explicitExtension, policy });
  const expectedMime = resolveExpectedMime({
    filename,
    extension: explicitExtension,
    policy
  });

  if (skipFileTypeCheck) {
    const resolvedExtension = explicitExtension || policy.fallbackExtension || '';
    return {
      filename: resolveAcceptedFilename({ filename, extension: resolvedExtension }),
      contentType: explicitRule?.verification === 'opaque' ? DEFAULT_CONTENT_TYPE : expectedMime,
      extension: resolvedExtension,
      detectionSource: explicitRule?.verification === 'opaque' ? 'opaque-extension' : 'fallback',
      correctedFilename: Boolean(resolvedExtension && resolvedExtension !== filenameExtension)
    };
  }

  if (explicitRule?.verification === 'opaque') {
    return {
      filename: resolveAcceptedFilename({ filename, extension: explicitRule.extension }),
      contentType: DEFAULT_CONTENT_TYPE,
      extension: explicitRule.extension,
      detectionSource: 'opaque-extension',
      correctedFilename: explicitRule.extension !== filenameExtension
    };
  }

  if (evidence.detectedMime) {
    const matchedAllowedExtension = resolveAllowedExtensionForMime({
      allowedExtensions,
      mime: evidence.detectedMime
    });
    const detectedMatchesExpected =
      expectedMime !== DEFAULT_CONTENT_TYPE &&
      mimesMatchForUpload(expectedMime, evidence.detectedMime);

    // 显式的可验证后缀必须与内容一致，不能因为检测出的另一种类型也在白名单中就静默改名。
    if (explicitExtension && !detectedMatchesExpected) {
      throw new Error(S3ErrEnum.uploadFileTypeMismatch);
    }

    const detectedMatchesPolicy = (() => {
      if (!allowedExtensions.length) {
        return expectedMime === DEFAULT_CONTENT_TYPE || detectedMatchesExpected;
      }

      return Boolean(matchedAllowedExtension) || detectedMatchesExpected;
    })();

    if (!detectedMatchesPolicy) {
      throw new Error(S3ErrEnum.uploadFileTypeMismatch);
    }

    const resolvedExtension = explicitExtension
      ? explicitExtension
      : matchedAllowedExtension || evidence.officeExtension || evidence.detectedExtension;
    return {
      filename: resolveAcceptedFilename({ filename, extension: resolvedExtension }),
      contentType: evidence.detectedMime,
      extension: resolvedExtension,
      detectionSource: evidence.source === 'office-zip' ? 'office-zip' : 'magic',
      correctedFilename: Boolean(resolvedExtension && resolvedExtension !== filenameExtension)
    };
  }

  if (evidence.isTextLike) {
    const textExtension = (() => {
      if (explicitExtension) {
        if (explicitRule?.verification === 'text') return explicitExtension;

        // 文本只能匹配显式声明的文本类型；fallback 仅用于真正缺少后缀的输入。
        throw new Error(S3ErrEnum.uploadFileTypeMismatch);
      }

      if (policy.textFallbackExtension) return policy.textFallbackExtension;

      const hintedExtension = resolveExtensionForMime({
        mime: normalizedHint.contentType,
        allowedExtensions
      });
      const hintedRule = resolveExtensionRule({ extension: hintedExtension, policy });
      return hintedRule?.verification === 'text' ? hintedExtension : '';
    })();

    if (textExtension && (!allowedExtensions.length || allowedExtensions.includes(textExtension))) {
      return {
        filename: resolveAcceptedFilename({ filename, extension: textExtension }),
        contentType: resolveMimeType([textExtension], expectedMime),
        extension: textExtension,
        detectionSource: 'text',
        correctedFilename: textExtension !== filenameExtension
      };
    }
  }

  if (!allowedExtensions.length) {
    return {
      filename,
      contentType: expectedMime,
      extension: explicitExtension,
      detectionSource: 'fallback',
      correctedFilename: false
    };
  }

  if (!explicitExtension) {
    throw new Error(S3ErrEnum.invalidUploadFileType);
  }

  throw new Error(S3ErrEnum.invalidUploadFileType);
};

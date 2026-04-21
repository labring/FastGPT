import { defaultFileExtensionTypes, type FileExtensionKeyType } from '../../core/app/constants';
import type { AppFileSelectConfigType } from '../../core/app/type/config.schema';

const uploadConfigKeys: FileExtensionKeyType[] = [
  'canSelectFile',
  'canSelectImg',
  'canSelectVideo',
  'canSelectAudio',
  'canSelectCustomFileExtension'
];

export const normalizeFileExtension = (extension?: string) => {
  if (!extension) return '';

  const trimmedExtension = extension.trim().toLowerCase();
  if (!trimmedExtension) return '';

  return trimmedExtension.startsWith('.') ? trimmedExtension : `.${trimmedExtension}`;
};

const getFileExtension = (filename?: string) => {
  if (!filename) return '';

  const extensionIndex = filename.lastIndexOf('.');
  if (extensionIndex < 0) return '';

  return normalizeFileExtension(filename.slice(extensionIndex));
};

export const isCSVFile = (filename: string) => {
  const extension = getFileExtension(filename);
  return extension === '.csv';
};

export const getAllowedExtensionsFromFileSelectConfig = (config?: AppFileSelectConfigType) => {
  if (!config) return [];

  return [
    ...new Set(
      uploadConfigKeys.flatMap((key) => {
        if (!config[key]) return [];

        if (key === 'canSelectCustomFileExtension') {
          return (config.customFileExtensionList || []).map(normalizeFileExtension).filter(Boolean);
        }

        return defaultFileExtensionTypes[key];
      })
    )
  ];
};

const getMimeCategory = (
  mimeType?: string
): 'canSelectImg' | 'canSelectVideo' | 'canSelectAudio' | undefined => {
  const normalizedMimeType = mimeType?.toLowerCase() || '';

  if (normalizedMimeType.startsWith('image/')) return 'canSelectImg';
  if (normalizedMimeType.startsWith('video/')) return 'canSelectVideo';
  if (normalizedMimeType.startsWith('audio/')) return 'canSelectAudio';

  return undefined;
};

export const isFileAllowedByFileSelectConfig = ({
  file,
  fileSelectConfig
}: {
  file: File;
  fileSelectConfig?: AppFileSelectConfigType;
}) => {
  const extension = getFileExtension(file.name);
  const allowedExtensions = getAllowedExtensionsFromFileSelectConfig(fileSelectConfig);

  if (extension && allowedExtensions.includes(extension)) {
    return true;
  }

  const mimeCategory = getMimeCategory(file.type);
  if (mimeCategory) {
    return Boolean(fileSelectConfig?.[mimeCategory]);
  }

  return false;
};

export function detectImageContentType(buffer: Buffer) {
  if (!buffer || buffer.length < 12) return 'text/plain';

  // JPEG
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';

  // PNG
  const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSig.every((v, i) => buffer.readUInt8(i) === v)) return 'image/png';

  // GIF
  const gifSig = buffer.subarray(0, 6).toString('ascii');
  if (gifSig === 'GIF87a' || gifSig === 'GIF89a') return 'image/gif';

  // WEBP
  const riff = buffer.subarray(0, 4).toString('ascii');
  const webp = buffer.subarray(8, 12).toString('ascii');
  if (riff === 'RIFF' && webp === 'WEBP') return 'image/webp';

  return 'text/plain';
}

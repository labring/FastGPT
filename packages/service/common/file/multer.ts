import type { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import path from 'path';
import type { BucketNameEnum } from '@fastgpt/global/common/file/constants';
import {
  bucketNameMap,
  DEFAULT_FILE_UPLOAD_LIMITS,
  FileUploadErrorEnum
} from '@fastgpt/global/common/file/constants';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import { UserError, FileUploadError } from '@fastgpt/global/common/error/utils';
import {
  validateFileUpload,
  getEffectiveUploadLimits,
  formatUploadLimitsMessage,
  type FileUploadLimits
} from './uploadValidation';

export type FileType = {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  filename: string;
  path: string;
  size: number;
};

/* 
  maxSize: File max size (MB)
  customLimits: Custom upload limits configuration
*/
export const getUploadModel = ({
  maxSize = DEFAULT_FILE_UPLOAD_LIMITS.MAX_FILE_SIZE_MB,
  customLimits
}: {
  maxSize?: number;
  customLimits?: FileUploadLimits;
} = {}) => {
  const limits = getEffectiveUploadLimits(customLimits);
  const effectiveMaxSize = Math.min(maxSize, limits.maxFileSizeMB);
  const maxSizeBytes = effectiveMaxSize * 1024 * 1024;

  class UploadModel {
    uploaderSingle = multer({
      limits: {
        fileSize: maxSizeBytes,
        fieldSize: maxSizeBytes
      },
      preservePath: true,
      storage: multer.diskStorage({
        // destination: (_req, _file, cb) => {
        //   cb(null, tmpFileDirPath);
        // },
        filename: (req, file, cb) => {
          if (!file?.originalname) {
            cb(new Error('File not found'), '');
          } else {
            const { ext } = path.parse(decodeURIComponent(file.originalname));
            cb(null, `${getNanoid()}${ext}`);
          }
        }
      })
    }).single('file');
    async getUploadFile<T = any>(
      req: NextApiRequest,
      res: NextApiResponse,
      originBucketName?: `${BucketNameEnum}`
    ) {
      return new Promise<{
        file: FileType;
        metadata: Record<string, any>;
        data: T;
        bucketName?: `${BucketNameEnum}`;
      }>((resolve, reject) => {
        // @ts-ignore
        this.uploaderSingle(req, res, (error) => {
          if (error) {
            if (error.code === 'LIMIT_FILE_SIZE') {
              return reject(
                new FileUploadError(
                  FileUploadErrorEnum.FILE_TOO_LARGE,
                  `File exceeds the maximum file size limit of ${effectiveMaxSize}MB`,
                  { maxSizeMB: effectiveMaxSize }
                )
              );
            }
            return reject(error);
          }

          // check bucket name
          const bucketName = (req.body?.bucketName || originBucketName) as `${BucketNameEnum}`;
          if (bucketName && !bucketNameMap[bucketName]) {
            return reject(new UserError('BucketName is invalid'));
          }

          // @ts-ignore
          const file = req.file as FileType;

          if (!file) {
            return reject(new UserError('No file uploaded'));
          }

          // Validate single file
          const decodedFile = {
            ...file,
            originalname: decodeURIComponent(file.originalname)
          };

          const validation = validateFileUpload([decodedFile], customLimits);
          if (!validation.isValid) {
            return reject(validation.errors[0]);
          }

          resolve({
            file: decodedFile,
            bucketName,
            metadata: (() => {
              if (!req.body?.metadata) return {};
              try {
                return JSON.parse(req.body.metadata);
              } catch (error) {
                return {};
              }
            })(),
            data: (() => {
              if (!req.body?.data) return {};
              try {
                return JSON.parse(req.body.data);
              } catch (error) {
                return {};
              }
            })()
          });
        });
      });
    }

    uploaderMultiple = multer({
      limits: {
        fileSize: maxSizeBytes,
        files: limits.maxFileCount,
        fieldSize: maxSizeBytes
      },
      preservePath: true,
      storage: multer.diskStorage({
        // destination: (_req, _file, cb) => {
        //   cb(null, tmpFileDirPath);
        // },
        filename: (req, file, cb) => {
          if (!file?.originalname) {
            cb(new Error('File not found'), '');
          } else {
            const { ext } = path.parse(decodeURIComponent(file.originalname));
            cb(null, `${getNanoid()}${ext}`);
          }
        }
      })
    }).array('file', limits.maxFileCount);
    async getUploadFiles<T = any>(req: NextApiRequest, res: NextApiResponse) {
      return new Promise<{
        files: FileType[];
        data: T;
      }>((resolve, reject) => {
        // @ts-ignore
        this.uploaderMultiple(req, res, (error) => {
          if (error) {
            console.log('File upload error:', error);

            if (error.code === 'LIMIT_FILE_SIZE') {
              return reject(
                new FileUploadError(
                  FileUploadErrorEnum.FILE_TOO_LARGE,
                  `File exceeds the maximum file size limit of ${effectiveMaxSize}MB`,
                  { maxSizeMB: effectiveMaxSize }
                )
              );
            }
            if (error.code === 'LIMIT_FILE_COUNT') {
              return reject(
                new FileUploadError(
                  FileUploadErrorEnum.TOO_MANY_FILES,
                  `File count exceeds the limit, maximum ${limits.maxFileCount} files supported`,
                  { maxFileCount: limits.maxFileCount }
                )
              );
            }
            if (error.code === 'LIMIT_UNEXPECTED_FILE') {
              return reject(
                new FileUploadError(
                  FileUploadErrorEnum.TOO_MANY_FILES,
                  `File count exceeds the limit, maximum ${limits.maxFileCount} files supported`,
                  { maxFileCount: limits.maxFileCount }
                )
              );
            }

            return reject(error);
          }

          // @ts-ignore
          const files = req.files as FileType[];

          if (!files || files.length === 0) {
            return reject(new UserError('No files uploaded'));
          }

          // Decode filenames and validate all files
          const decodedFiles = files.map((file) => ({
            ...file,
            originalname: decodeURIComponent(file.originalname)
          }));

          const validation = validateFileUpload(decodedFiles, customLimits);
          if (!validation.isValid) {
            // Return the first error, but include information about all errors
            const errorMessage = validation.errors.map((err) => err.message).join('; ');
            return reject(
              new FileUploadError(validation.errors[0].code, errorMessage, {
                errors: validation.errors,
                totalErrors: validation.errors.length,
                limits: formatUploadLimitsMessage(limits)
              })
            );
          }

          resolve({
            files: validation.validFiles,
            data: (() => {
              if (!req.body?.data) return {};
              try {
                return JSON.parse(req.body.data);
              } catch (error) {
                return {};
              }
            })()
          });
        });
      });
    }
  }

  return new UploadModel();
};

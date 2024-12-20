import path from 'path';
import { isProduction } from '@fastgpt/global/common/system/constants';

export const tmpFileDirPath = isProduction ? '/app/tmp' : path.join(process.cwd(), 'tmp');

export const previewMaxCharCount = 3000;

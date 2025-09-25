import { getS3AvatarSource } from './avatar';
import { getS3ChatSource } from './chat';
import { getS3DatasetSource } from './dataset';
import { getS3DatasetImageSource } from './dataset-image';
import { getS3InvoiceSource } from './invoice';
import { getS3RawtextSource } from './rawtext';

export function registerSources() {
  getS3AvatarSource();
  getS3ChatSource();
  getS3DatasetImageSource();
  getS3DatasetSource();
  getS3InvoiceSource();
  getS3RawtextSource();
}

export {
  getS3AvatarSource,
  getS3ChatSource,
  getS3DatasetImageSource,
  getS3DatasetSource,
  getS3InvoiceSource,
  getS3RawtextSource
};

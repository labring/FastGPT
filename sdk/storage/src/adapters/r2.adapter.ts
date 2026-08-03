import type { IR2StorageOptions, IStorage } from '../interface';
import { AwsS3StorageAdapter } from './aws-s3.adapter';

export class R2StorageAdapter extends AwsS3StorageAdapter implements IStorage {
  constructor(options: IR2StorageOptions) {
    if (options.vendor !== 'r2') {
      throw new Error('Invalid storage vendor: expected "r2"');
    }

    super(options);
  }
}

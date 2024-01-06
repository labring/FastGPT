export enum BucketNameEnum {
  dataset = 'dataset'
}
export const bucketNameMap = {
  [BucketNameEnum.dataset]: {
    label: 'common.file.bucket.dataset'
  }
};

export const FileBaseUrl = '/api/common/file/read';

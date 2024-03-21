/* mongo fs bucket */
export enum BucketNameEnum {
  dataset = 'dataset'
}
export const bucketNameMap = {
  [BucketNameEnum.dataset]: {
    label: 'common.file.bucket.dataset'
  }
};

export const ReadFileBaseUrl = '/api/common/file/read';

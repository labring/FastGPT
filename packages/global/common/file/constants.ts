/* mongo fs bucket */
export enum BucketNameEnum {
  dataset = 'dataset'
}
export const bucketNameMap = {
  [BucketNameEnum.dataset]: {
    label: 'file.bucket.dataset'
  }
};

export const ReadFileBaseUrl = '/api/common/file/read';

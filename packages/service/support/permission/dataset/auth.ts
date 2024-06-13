import { PermissionValueType } from '@fastgpt/global/support/permission/type';
import { getResourcePermission, parseHeaderCert } from '../controller';
import { AuthPropsType, AuthResponseType } from '../type/auth';
import { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { getTmbInfoByTmbId } from 'support/user/team/controller';
import { MongoDataset } from 'core/dataset/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetPermission } from '@fastgpt/global/support/permission/dataset/controller';

export async function authDatasetByTmbId({
  // teamId,
  tmbId,
  datasetId,
  per
}: {
  // teamId: string;
  tmbId: string;
  datasetId: string;
  per: PermissionValueType;
}) {
  const { teamId, permission: tmbPer } = await getTmbInfoByTmbId({ tmbId });

  const dataset = await (async () => {
    // get app and per
    const [dataset, rp] = await Promise.all([
      MongoDataset.findOne({ _id: datasetId, teamId }).lean(),
      getResourcePermission({
        teamId,
        tmbId,
        resourceId: datasetId,
        resourceType: PerResourceTypeEnum.dataset
      }) // this could be null
    ]);

    if (!dataset) {
      return Promise.reject(DatasetErrEnum.unExist);
    }

    const isOwner = tmbPer.isOwner || String(dataset.tmbId) === tmbId;
    const Per = new DatasetPermission({
      per: rp?.permission ?? dataset.defaultPermission,
      isOwner
    });

    if (!Per.checkPer(per)) {
      return Promise.reject(DatasetErrEnum.unAuthDataset);
    }

    return {
      ...dataset,
      permission: Per
    };
  })();

  return { dataset: dataset };
}

// Auth Dataset
export async function AuthDataset({
  datasetId,
  per,
  ...props
}: AuthPropsType & {
  datasetId: string;
}): Promise<
  AuthResponseType & {
    dataset: DatasetSchemaType;
  }
> {
  const { teamId, tmbId } = await parseHeaderCert(props);

  const { dataset } = await authDatasetByTmbId({
    // teamId,
    tmbId,
    datasetId,
    per
  });

  return {
    teamId,
    tmbId,
    dataset,
    permission: dataset.permission
  };
}

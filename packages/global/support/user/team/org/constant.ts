import { OrgSchemaType } from './type';

export const OrgCollectionName = 'team_orgs';
export const OrgMemberCollectionName = 'team_org_members';

export const getOrgChildrenPath = (org: OrgSchemaType) => `${org.path}/${org.pathId}`;

export enum SyncOrgSourceEnum {
  wecom = 'wecom'
}

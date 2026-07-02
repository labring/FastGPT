import type { ClientSession } from '../../../common/mongo';
import { MongoOpenApiTag, type OpenApiTagSchemaType } from './schema';

export type CreateOpenApiTagData = Pick<
  OpenApiTagSchemaType,
  'teamId' | 'tmbId' | 'name' | 'normalizedName' | 'type' | 'order'
>;

export const createOpenApiTag = (data: CreateOpenApiTagData, session?: ClientSession) =>
  MongoOpenApiTag.create([data], { session });

export const findOpenApiTagsByMember = ({ teamId, tmbId }: { teamId: string; tmbId: string }) =>
  MongoOpenApiTag.find({ teamId, tmbId }).sort({ order: 1, createTime: 1, _id: 1 }).lean();

export const findOpenApiTagsByIds = ({
  teamId,
  tmbId,
  tagIds
}: {
  teamId: string;
  tmbId: string;
  tagIds: string[];
}) =>
  MongoOpenApiTag.find({
    teamId,
    tmbId,
    _id: { $in: tagIds }
  })
    .sort({ order: 1, createTime: 1, _id: 1 })
    .lean();

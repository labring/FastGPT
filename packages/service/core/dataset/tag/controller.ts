import { ClientSession } from 'mongoose';
import { MongoDatasetCollectionTags } from './schema';

export async function createOneTag({
  tagContent,
  datasetId,
  teamId,
  session
}: {
  tagContent: string;
  datasetId: string;
  teamId: string;
  session?: ClientSession;
}) {
  const existingTag = await MongoDatasetCollectionTags.findOne({
    teamId,
    datasetId,
    tag: tagContent
  });

  if (existingTag) {
    throw new Error('Tag already exists');
  }

  const [tag] = await MongoDatasetCollectionTags.create(
    [
      {
        teamId,
        datasetId,
        tag: tagContent
      }
    ],
    { session }
  );

  return tag;
}

export async function updateOneTag({
  tagId,
  tagContent,
  teamId,
  datasetId,
  session
}: {
  tagId: string;
  tagContent: string;
  teamId: string;
  datasetId: string;
  session?: ClientSession;
}) {
  const existingTag = await MongoDatasetCollectionTags.findOne({
    teamId,
    datasetId,
    tag: tagContent
  });

  if (existingTag) {
    throw new Error('Tag already exists');
  }

  await MongoDatasetCollectionTags.updateOne(
    {
      _id: tagId,
      teamId,
      datasetId
    },
    {
      $set: {
        tag: tagContent
      }
    },
    { session }
  );
}

export async function deleteOneTag({
  tagId,
  teamId,
  datasetId,
  session
}: {
  tagId: string;
  teamId: string;
  datasetId: string;
  session?: ClientSession;
}) {
  const tag = await MongoDatasetCollectionTags.findOne({
    _id: tagId,
    teamId,
    datasetId
  });

  if (!tag) {
    throw new Error('Tag not found');
  }

  await MongoDatasetCollectionTags.deleteOne(
    {
      _id: tagId,
      datasetId,
      teamId
    },
    { session }
  );
}

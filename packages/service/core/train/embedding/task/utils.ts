/**
 * Build aggregation pipeline for fetching embedding train task with creator info
 * @param baseFields - Additional fields to include in projection
 * @returns MongoDB aggregation pipeline stages
 */
export function buildEmbeddingTrainTaskAggregationPipeline(baseFields?: Record<string, any>) {
  return [
    // Lookup team member (creator) info
    {
      $lookup: {
        from: 'team_members',
        localField: 'tmbId',
        foreignField: '_id',
        as: 'teamMember'
      }
    },
    // Transform array to single object
    {
      $addFields: {
        teamMember: { $arrayElemAt: ['$teamMember', 0] }
      }
    },
    // Project final fields
    {
      $project: {
        _id: 1,
        teamId: 1,
        tmbId: 1,
        name: 1,
        baseModelId: 1,
        baseModelEndpoint: 1,
        trainsetId: 1,
        evalDatasetId: 1,
        datasetIds: 1,
        newModelName: 1,
        status: 1,
        checkpoint: 1,
        result: 1,
        errorMsg: 1,
        jobId: 1,
        createTime: 1,
        updateTime: 1,
        finishTime: 1,
        // Creator info from team member
        creatorAvatar: '$teamMember.avatar',
        creatorName: '$teamMember.name',
        ...baseFields
      }
    }
  ];
}

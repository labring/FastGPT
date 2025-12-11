/**
 * Build aggregation pipeline for fetching train task with creator info and app info
 * @param baseFields - Additional fields to include in projection
 * @returns MongoDB aggregation pipeline stages
 */
export function buildTrainTaskAggregationPipeline(baseFields?: Record<string, any>) {
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
    // Lookup app info
    {
      $lookup: {
        from: 'apps',
        localField: 'appId',
        foreignField: '_id',
        as: 'app'
      }
    },
    // Transform arrays to single objects
    {
      $addFields: {
        teamMember: { $arrayElemAt: ['$teamMember', 0] },
        app: { $arrayElemAt: ['$app', 0] }
      }
    },
    // Project final fields
    {
      $project: {
        _id: 1,
        appId: 1,
        teamId: 1,
        tmbId: 1,
        name: 1,
        baseModelConfigId: 1,
        baseModelEndpoint: 1,
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
        // App info
        appName: '$app.name',
        appAvatar: '$app.avatar',
        ...baseFields
      }
    }
  ];
}

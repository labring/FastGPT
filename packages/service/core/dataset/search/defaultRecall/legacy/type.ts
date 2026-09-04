export type LegacyCollectionFilterMatch = {
  tags?: {
    $and?: Array<string | null>;
    $or?: Array<string | null>;
  };
  createTime?: { $gte?: string; $lte?: string };
  collectionIds?: string[];
};

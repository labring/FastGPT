import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  GetKeywordQuoteParams,
  GetKeywordQuoteResponse
} from '@fastgpt/global/core/chat/correction/api';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoDatasetData } from '@fastgpt/service/core/dataset/data/schema';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { replaceRegChars } from '@fastgpt/global/common/string/tools';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { extractiveText } from '@fastgpt/service/common/string/extractive';
import { jiebaSplit } from '@fastgpt/service/common/string/jieba';

async function handler(
  req: ApiRequestProps<GetKeywordQuoteParams>
): Promise<GetKeywordQuoteResponse> {
  const {
    appId,
    chatId,
    keyword,
    datasetIds = [],
    collectionIds,
    shareId,
    outLinkUid,
    teamId: spaceTeamId,
    teamToken
  } = req.body;

  const { teamId } = await authChatCrud({
    req,
    authToken: true,
    appId,
    chatId,
    shareId,
    outLinkUid,
    teamId: spaceTeamId,
    teamToken
  });

  if (!keyword?.trim()) {
    return { list: [], total: 0 };
  }

  const app = await MongoApp.findById(appId, 'modules').lean();
  if (!app) {
    return Promise.reject(AppErrEnum.unExist);
  }

  if (datasetIds.length === 0) {
    return { list: [], total: 0 };
  }

  const { offset, pageSize: rawPageSize } = parsePaginationRequest(req);
  const pageSize = Math.min(rawPageSize, 50);

  // Use jieba to segment keywords for multi-word search support
  // Handles Chinese text segmentation and removes stop words
  const segmentedText = await jiebaSplit({ text: keyword.trim() });
  const keywordsArray = segmentedText ? segmentedText.split(' ').filter((k) => k.trim()) : [];

  // Fallback to original keyword if jieba returns nothing (all stop words)
  const keywords = keywordsArray.length > 0 ? keywordsArray : [keyword.trim()];

  // Create regex patterns with UCP option for Unicode-aware word boundaries
  // (*UCP) enables proper word boundary detection for non-ASCII characters
  const regexPatterns = keywords.map((kw) => {
    const escaped = replaceRegChars(kw);
    return { $regex: `(*UCP)${escaped}`, $options: 'i' };
  });

  // Build match query: search for any keyword in either q or a fields
  const match = {
    teamId,
    datasetId: { $in: datasetIds },
    $or: regexPatterns.flatMap((pattern) => [{ q: pattern }, { a: pattern }])
  };

  if (collectionIds && collectionIds.length > 0) {
    Object.assign(match, { collectionId: { $in: collectionIds } });
  }
  const [list, total] = await Promise.all([
    MongoDatasetData.find(match, '_id datasetId collectionId q a')
      .populate('collectionId', 'name')
      .sort({ updateTime: -1, _id: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoDatasetData.countDocuments(match)
  ]);

  const formatList = list.map((item: any) => ({
    datasetDataId: String(item._id),
    q: item.q || '',
    a: item.a || undefined,
    sourceName: item.collectionId?.name || '',
    extractiveText: item.q
      ? extractiveText({
          text: item.q,
          keyword: keyword,
          maxLength: 200,
          minLength: 50
        })
      : ''
  }));

  return { list: formatList, total };
}

export default NextAPI(handler);

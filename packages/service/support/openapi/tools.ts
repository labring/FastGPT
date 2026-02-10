import { MongoOpenApi } from './schema';
import { getLogger, LogCategories } from '../../common/logger';

const logger = getLogger(LogCategories.MODULE.USER);

export function updateApiKeyUsedTime(id: string) {
  MongoOpenApi.findByIdAndUpdate(id, {
    lastUsedTime: new Date()
  }).catch((err) => {
    logger.error('Failed to update API key last used time', { apiKeyId: id, error: err });
  });
}

export function updateApiKeyUsage({
  apikey,
  totalPoints
}: {
  apikey: string;
  totalPoints: number;
}) {
  MongoOpenApi.findOneAndUpdate(
    { apiKey: apikey },
    {
      $inc: {
        usagePoints: totalPoints
      }
    }
  ).catch((err) => {
    logger.error('Failed to update API key usage points', { apikey, error: err });
  });
}

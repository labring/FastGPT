import { MongoOpenApi } from './schema';

export function updateApiKeyUsedTime(id: string) {
  MongoOpenApi.findByIdAndUpdate(id, {
    lastUsedTime: new Date()
  }).catch((err) => {
    console.log('update apiKey used time error', err);
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
    console.log('update apiKey totalPoints error', err);
  });
}

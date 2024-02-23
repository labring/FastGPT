import { MongoOpenApi } from './schema';

export function updateApiKeyUsedTime(id: string) {
  MongoOpenApi.findByIdAndUpdate(id, {
    lastUsedTime: new Date()
  }).catch((err) => {
    console.log('update apiKey used time error', err);
  });
}

export function updateApiKeyUsage({ apikey, usage }: { apikey: string; usage: number }) {
  MongoOpenApi.findOneAndUpdate(
    { apiKey: apikey },
    {
      $inc: {
        usage
      }
    }
  ).catch((err) => {
    console.log('update apiKey usage error', err);
  });
}

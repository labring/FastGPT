import { MongoOpenApi } from './schema';

export async function updateApiKeyUsedTime(id: string) {
  await MongoOpenApi.findByIdAndUpdate(id, {
    lastUsedTime: new Date()
  });
}

export async function updateApiKeyUsage({ apikey, usage }: { apikey: string; usage: number }) {
  await MongoOpenApi.findOneAndUpdate(
    { apiKey: apikey },
    {
      $inc: {
        usage
      }
    }
  );
}

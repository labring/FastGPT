import { OpenApi } from './schema';

export async function updateApiKeyUsedTime(id: string) {
  await OpenApi.findByIdAndUpdate(id, {
    lastUsedTime: new Date()
  });
}

export async function updateApiKeyUsage({ apikey, usage }: { apikey: string; usage: number }) {
  await OpenApi.findOneAndUpdate(
    { apiKey: apikey },
    {
      $inc: {
        usage
      }
    }
  );
}

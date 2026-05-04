declare global {
  namespace NodeJS {
    interface ProcessEnv {
      AUTH_TOKEN?: string;
      DB_MAX_LINK: string;
      MONGODB_URI: string;
      S3_PREFIX: string;
      SYNC_INDEX?: string;
    }
  }
}

export {};

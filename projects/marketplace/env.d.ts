declare global {
  namespace NodeJS {
    interface ProcessEnv {
      S3_PREFIX: string;
    }
  }
}

declare global {
  var countTrackQueue: Map<string, { event: string; count: number; data: Record<string, any> }>;

  namespace NodeJS {
    interface ProcessEnv {
      DEFAULT_ROOT_PSW: string;
      PRO_URL: string;
      LOG_DEPTH: string;
      DB_MAX_LINK: string;

      STORAGE_VENDOR?: 'minio' | 'aws-s3' | 'cos' | 'oss';
      STORAGE_PUBLIC_BUCKET?: string;
      STORAGE_PRIVATE_BUCKET?: string;
      STORAGE_REGION?: string;
      STORAGE_EXTERNAL_ENDPOINT?: string;
      STORAGE_S3_ENDPOINT?: string;
      STORAGE_PUBLIC_ACCESS_EXTRA_SUB_PATH?: string;
      STORAGE_ACCESS_KEY_ID?: string;
      STORAGE_SECRET_ACCESS_KEY?: string;
      STORAGE_S3_FORCE_PATH_STYLE?: string;
      STORAGE_S3_MAX_RETRIES?: string;
      STORAGE_COS_PROTOCOL?: 'https:' | 'http:';
      STORAGE_COS_USE_ACCELERATE?: string;
      STORAGE_COS_CNAME_DOMAIN?: string;
      STORAGE_COS_PROXY?: string;
      STORAGE_OSS_ENDPOINT?: string;
      STORAGE_OSS_CNAME?: string;
      STORAGE_OSS_INTERNAL?: string;
      STORAGE_OSS_SECURE?: string;
      STORAGE_OSS_ENABLE_PROXY?: string;

      AES256_SECRET_KEY: string;
      ROOT_KEY: string;
      OPENAI_BASE_URL: string;
      CHAT_API_KEY: string;
      AIPROXY_API_ENDPOINT: string;
      AIPROXY_API_TOKEN: string;
      MULTIPLE_DATA_TO_BASE64: string;
      MONGODB_URI: string;
      MONGODB_LOG_URI?: string;

      // Vector
      VECTOR_VQ_LEVEL: string;
      PG_URL: string;
      OPENGAUSS_URL: string;
      OCEANBASE_URL: string;
      SEEKDB_URL: string;
      MILVUS_ADDRESS: string;
      MILVUS_TOKEN: string;

      CODE_SANDBOX_URL: string;
      FE_DOMAIN: string;
      FILE_DOMAIN: string;
      USE_IP_LIMIT?: string;
      WORKFLOW_MAX_RUN_TIMES?: string;
      WORKFLOW_MAX_LOOP_TIMES?: string;
      CHECK_INTERNAL_IP?: string;
      ALLOWED_ORIGINS?: string;
      SHOW_COUPON?: string;
      SHOW_DISCOUNT_COUPON?: string;
      CONFIG_JSON_PATH?: string;
      PASSWORD_LOGIN_LOCK_SECONDS?: string; // 密码登录锁定时间
      PASSWORD_EXPIRED_MONTH?: string;
      MAX_LOGIN_SESSION?: string;
      CHAT_MAX_QPM?: string;

      CHAT_LOG_URL?: string;
      CHAT_LOG_INTERVAL?: string;
      CHAT_LOG_SOURCE_ID_PREFIX?: string;

      NEXT_PUBLIC_BASE_URL: string;

      MAX_HTML_TRANSFORM_CHARS: string;
    }
  }
}

export {};

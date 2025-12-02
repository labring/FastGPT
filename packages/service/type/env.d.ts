declare global {
  namespace NodeJS {
    interface ProcessEnv {
      LOG_DEPTH: string;
      DB_MAX_LINK: string;
      FILE_TOKEN_KEY: string;
      AES256_SECRET_KEY: string;
      ROOT_KEY: string;
      OPENAI_BASE_URL: string;
      CHAT_API_KEY: string;
      AIPROXY_API_ENDPOINT: string;
      AIPROXY_API_TOKEN: string;
      MULTIPLE_DATA_TO_BASE64: string;
      MONGODB_URI: string;
      MONGODB_LOG_URI?: string;
      PG_URL: string;
      OCEANBASE_URL: string;
      MILVUS_ADDRESS: string;
      MILVUS_TOKEN: string;
      SANDBOX_URL: string;
      FE_DOMAIN: string;
      FILE_DOMAIN: string;
      LOG_LEVEL?: string;
      STORE_LOG_LEVEL?: string;
      USE_IP_LIMIT?: string;
      WORKFLOW_MAX_RUN_TIMES?: string;
      WORKFLOW_MAX_LOOP_TIMES?: string;
      CHECK_INTERNAL_IP?: string;
      ALLOWED_ORIGINS?: string;
      SHOW_COUPON?: string;
      SHOW_DISCOUNT_COUPON?: string;
      CONFIG_JSON_PATH?: string;
      PASSWORD_LOGIN_LOCK_SECONDS?: string;
      PASSWORD_EXPIRED_MONTH?: string;
      MAX_LOGIN_SESSION?: string;
      CHAT_MAX_QPM?: string;

      // 安全配置
      // 密码登录锁定时间
      PASSWORD_LOGIN_LOCK_SECONDS?: string;

      // Signoz
      SIGNOZ_BASE_URL?: string;
      SIGNOZ_SERVICE_NAME?: string;

      CHAT_LOG_URL?: string;
      CHAT_LOG_INTERVAL?: string;
      CHAT_LOG_SOURCE_ID_PREFIX?: string;

      NEXT_PUBLIC_BASE_URL: string;
    }
  }
}

export {};

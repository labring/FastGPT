declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DEFAULT_ROOT_PSW: string;
      PRO_URL: string;
    }
  }
}

export {};

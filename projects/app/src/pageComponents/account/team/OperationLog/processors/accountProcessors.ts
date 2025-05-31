// Account processors
export const createBasicAccountProcessor = () => (metadata: any) => metadata;

export const createAccountProcessors = () => ({
  CHANGE_PASSWORD: createBasicAccountProcessor(),
  CHANGE_NOTIFICATION_SETTINGS: createBasicAccountProcessor(),
  CHANGE_MEMBER_NAME_ACCOUNT: createBasicAccountProcessor(),
  PURCHASE_PLAN: createBasicAccountProcessor(),
  EXPORT_BILL_RECORDS: createBasicAccountProcessor(),
  CREATE_INVOICE: createBasicAccountProcessor(),
  SET_INVOICE_HEADER: createBasicAccountProcessor(),
  CREATE_API_KEY: createBasicAccountProcessor(),
  UPDATE_API_KEY: createBasicAccountProcessor(),
  DELETE_API_KEY: createBasicAccountProcessor()
});

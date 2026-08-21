/** CRM 营销与生命周期上报的稳定公开入口。 */
export {
  CRMLifecycleEvent,
  reportCRMTeamConsumptionOnce,
  reportCRMTeamEnterpriseVerificationOnce,
  reportCRMTeamEnterpriseRechargeAmount,
  reportCRMTeamRechargeOnce
} from './crm';
export type { CRMEnterpriseVerificationDetails } from './crm';

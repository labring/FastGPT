import { GET, POST, PUT, DELETE } from '@/api/request';
import { CreateTrainingBillType } from './index.d';

export const postCreateTrainingBill = (data: CreateTrainingBillType) =>
  POST<string>(`/common/bill/createTrainingBill`, data);

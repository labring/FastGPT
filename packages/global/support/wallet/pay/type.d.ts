export type PaySchema = {
  _id: string;
  userId: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  price: number;
  orderId: string;
  status: 'SUCCESS' | 'REFUND' | 'NOTPAY' | 'CLOSED';
};

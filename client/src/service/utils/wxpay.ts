// @ts-ignore
import Payment from 'wxpay-v3';

export const getPayment = () => {
  return new Payment({
    appid: process.env.WX_APPID,
    mchid: process.env.WX_MCHID,
    private_key: process.env.WX_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    serial_no: process.env.WX_SERIAL_NO,
    apiv3_private_key: process.env.WX_V3_CODE,
    notify_url: process.env.WX_NOTIFY_URL
  });
};

export const nativePay = (amount: number, payId: string): Promise<string> =>
  getPayment()
    .native({
      description: 'Fast GPT 余额充值',
      out_trade_no: payId,
      amount: {
        total: amount
      }
    })
    .then((res: any) => JSON.parse(res.data).code_url);

export const getPayResult = (payId: string) =>
  getPayment()
    .getTransactionsByOutTradeNo({
      out_trade_no: payId
    })
    .then((res: any) => JSON.parse(res.data));

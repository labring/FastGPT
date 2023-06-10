// @ts-ignore
import Payment from 'wxpay-v3';

const key = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC+ATv1brNR90aT
Ee1uhreBR2B2VlZ0xYNO4FnUTp7hNb8YrDIr7RMy01eFCTLsfGYpRi3WSC6MIBYp
qOrkMHVwu46vUFHigttrAnfS5LxbEMl/OK/XmQvieHi+hKnQ49qXhblBkH6jhlNB
hwopfDZiCRbvnAVOL0glzcewdF3miM19fKmtJFo/z7ZGGhP8Xk0TjJ9vXc+dkd8H
CqJydjsNPzjZqjWz+UvbJgnVCOocvlTMxIdpzhGa1EZ2XyWWkuky2/BeLrkyX7uR
9evhqTLG3Lqkz971ZorxBPnClPf1uhpsG6Li2XN0gdbfkbYc937NuXL3yybQwdmv
yXHr+L7JAgMBAAECggEAXv4E+P6AXmFPAmY7Gz/07Ig/3MnrbXP14vBdWLx5yERz
pqUobDeZmpZ4sgVYVU0YUlhIwFHUG7BLBEb0MGNdw5+xhUqVtbYQdt6EA4bh+HFb
G+S+XP6iJ3Ztf2qZ79qKxahQZ0wTVDPq2d7moLj+A2Nh+Sc6q80NuAC6biivbXpo
xWeYC5snjgKwd9hU2vAcwMiKL0OdpnMhINsoSqUmUHuPbaGHE7dEX8dANFpjZWDa
n+s/Zy4eFxWUf8lwIR79y/dTH1okyUtf+9BTWrV4d5Y10AGiuGpdFi2ZOau1SCoi
nOln9NUcRlrW7ePV0Xk7HLrCY6QY/dvI7sb6JnQwtQKBgQDpnLFH7ZcgwVh3vEc/
xudc3PTkojFNub7ntc+oexRCXVJZ3oPijkQ8j047Bi87c4RogE+CtWyj8A1oyZTp
sivdtCQ+ZPctgr1E8mgAKu1QSNS/flOmNKg5vYKUXGc3nNlX9yuj8qKPSujipI1g
H2pb1I4tYcbAm+Z/5+SeoUf+2wKBgQDQNrSqUNo6+iunzzjbMxbylNtac07M3XNB
6wICVflOUKrjnOA0Fn4D03u8rzfBXiGpuVnTbF6zD//l2D9gziZIJDlU1a4uMJEp
qV+ISlWxvsYkzwdGjvb7hmr4CxO/1R7WW09bb+fAF9JPAa92lbKarg3EqDHaAaiZ
AkBflR3QKwKBgQCKYl3KA/4wUxg65Xc3WnYXVnRjM4kNR+jEjbjTTwVzQqDTx7JM
dIYLccCfykwUZZub49Y10Y7nlf37gt4JiZfenyWRKHIbrYS84POmlcc6dcpBHW4j
2LGGcrJ1fD9QfENrjml1lveg9nj6OQveUv3IJCOM0ozP8Aoc3ptZNKTXXQKBgDvm
YRdWZ1HsQr7mKK83BXUISgq9fYAGfXALUeqmHTDgmCkfKokRp3MmVkS0C9A/amPP
hP4EAUJ2aeIP0jvhUrYSZcP4LUHwivJ3XZpx+DFIduyD+s3bt0YpJ4DwfuADSfnV
DwF5MizbLY+5JmdxLY6+YAuhb6YOMBjEwww8c/U9AoGAU1HgPp5TCjlqu7Xtov2i
WMQs/oHIe2tP7hRhr9li6VHG+dBjOiPJ0Bs2vBNDUBQkDXCMrMHCzMjfJiZSjeKZ
c0nANAU19hlZehxcKiD9rMD4lXg5NlW+dVjXRKo98SxQ3EYA0nGzc7haJD4d9n9+
1Cis4awrG6IO4I6r5Yosb4E=
-----END PRIVATE KEY-----`;

export const getPayment = () => {
  console.log('getPayment');
  return new Payment({
    appid: process.env.WX_APPID,
    mchid: process.env.WX_MCHID,
    // private_key: process.env.WX_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    private_key: key,
    serial_no: process.env.WX_SERIAL_NO,
    apiv3_private_key: process.env.WX_V3_CODE,
    notify_url: process.env.WX_NOTIFY_URL
  });
};

export const nativePay = (amount: number, payId: string): Promise<string> =>
  getPayment()
    .native({
      description: 'Use AIS 余额充值',
      out_trade_no: payId,
      amount: {
        total: amount
      }
    })
    .then((res: any) => {
      console.log(res);
      return JSON.parse(res.data).code_url;
    });

export const getPayResult = (payId: string) =>
  getPayment()
    .getTransactionsByOutTradeNo({
      out_trade_no: payId
    })
    .then((res: any) => JSON.parse(res.data));

import * as nodemailer from 'nodemailer';
import { UserAuthTypeEnum } from '@/constants/common';
import Dysmsapi, * as dysmsapi from '@alicloud/dysmsapi20170525';
// @ts-ignore
import * as OpenApi from '@alicloud/openapi-client';
// @ts-ignore
import * as Util from '@alicloud/tea-util';

const myEmail = process.env.MY_MAIL;
const mailTransport = nodemailer.createTransport({
  // host: 'smtp.qq.phone',
  service: 'qq',
  secure: true, //安全方式发送,建议都加上
  auth: {
    user: myEmail,
    pass: process.env.MAILE_CODE
  }
});

const emailMap: { [key: string]: any } = {
  [UserAuthTypeEnum.register]: {
    subject: '注册 FastGPT 账号',
    html: (code: string) => `
    <div>
    <includetail>
        <table style="font-family: Segoe UI, SegoeUIWF, Arial, sans-serif; font-size: 12px; color: #333333; border-spacing: 0px; border-collapse: collapse; padding: 0px; width: 580px; direction: ltr">
            <tbody>
            <tr>
                <td style="font-size: 10px; padding: 0px 0px 7px 0px; text-align: right">
                    您正在注册 FastGPT 账号，验证码为：${code} FastGPT &nbsp;GPT
                </td>
            </tr>
            <tr style="background-color: #0078D4">
                <td style="padding: 0px">
                    <table style="font-family: Segoe UI, SegoeUIWF, Arial, sans-serif; border-spacing: 0px; border-collapse: collapse; width: 100%">
                        <tbody>
                        <tr>
                            <td style="padding: 0px; width: 175px; max-width: 175px">
                                <img src="https://omex.cdn.office.net/images/retailer.images/invite/4aa98a27d0d4978a.png">
                            </td>
                            <td style="padding: 0px; width: 100%">
                            </td>
                            <td style="padding: 0px; width: 107px; max-width: 107px">
                                <img src="https://omex.cdn.office.net/images/retailer.images/invite/fd67eae9865f5f10.png">
                            </td>
                        </tr>
                        <tr>
                            <td style="font-size: 38px; color: #FFFFFF; padding: 12px 22px 4px 22px" colspan="3">
                               <div>您正在注册 FastGPT 账号，验证码为：</div>
                            </td>
                        </tr>
                        <tr>
                            <td style="font-size: 20px; color: #FFFFFF; padding: 0px 22px 18px 22px" colspan="3">
                              ${code}
                            </td>
                        </tr>
                        </tbody>
                    </table>
                </td>
            </tr>
            <tr>
                <td style="padding: 30px 20px; border-bottom-style: solid; border-bottom-color: #0078D4; border-bottom-width: 4px">
                    <table style="font-family: Segoe UI, SegoeUIWF, Arial, sans-serif; font-size: 12px; color: #333333; border-spacing: 0px; border-collapse: collapse; width: 100%">
                        <tbody>
                        <tr>
                            <td style="font-size: 12px; padding: 0px 0px 5px 0px">
                                使用此账号的人将拥有:
                                <ul style="font-size: 14px">
                                    <li style="padding-top: 10px">
                                        世界上目前上最顶尖的人工智能助理。
                                    </li>
                                    <li>
                                        管理安帐户的页面。
                                    </li>
                                    <li>
                                        他们专属的 FastGPT 帐户，包含额外 xxx 的每日额度。
                                    </li>
                                </ul>
                            </td>
                        </tr>
                        <tr>
                            <td style="font-size: 12px; padding: 0px 0px 15px 0px">
                                希望邀请更多人? 或删除一些人?
                                <a href="" style="color: #0044CC; text-decoration: none">转到您的帐户页面。</a>
                                您需要首先登录到您的 xxxxx 帐户。
                            </td>
                        </tr>
                        <tr>
                            <td style="font-size: 12px; padding: 0px;">
                                想要了解有关  FastGPTxxx 更多信息?
                                <a href="" style="color: #0044CC; text-decoration: none">查看 Office 常见问题。</a>
                            </td>
                        </tr>
                        </tbody>
                    </table>
                </td>
            </tr>
            <tr>
                <td style="padding: 35px 0px; color: #B2B2B2; font-size: 12px">
                    Microsoft Office
                    <br>
                    One Microsoft Way
                    <br>
                    Redmond, WA
                    <br>
                    98052 USA
                </td>
            </tr>
            <tr>
                <td style="padding: 0px 0px 10px 0px; color: #B2B2B2; font-size: 12px">
                    版权所有 Microsoft Corporation
                    <br>
                    <a href="" style="color: #0044CC">隐私声明</a>
                    <br>
                    <a href="" style="color: #0044CC">需要帮助? 请与支持部门联系</a>
                </td>
            </tr>
            </tbody>
        </table>
      </includetail>
      </div>
    `
  },
  [UserAuthTypeEnum.findPassword]: {
    subject: '修改 FastGPT 密码',
    html: (code: string) => `<div>您正在修改 FastGPT 账号密码，验证码为：${code}</div>`
  }
};

export const sendEmailCode = (email: string, code: string, type: `${UserAuthTypeEnum}`) => {
  return new Promise((resolve, reject) => {
    const options = {
      from: `"FastGPT" ${myEmail}`,
      to: email,
      subject: emailMap[type]?.subject,
      html: emailMap[type]?.html(code)
    };
    mailTransport.sendMail(options, function (err, msg) {
      if (err) {
        console.log('send email error->', err);
        reject('发生邮件异常');
      } else {
        resolve('');
      }
    });
  });
};

export const sendPhoneCode = async (phone: string, code: string) => {
  const accessKeyId = process.env.aliAccessKeyId;
  const accessKeySecret = process.env.aliAccessKeySecret;
  const signName = process.env.aliSignName;
  const templateCode = process.env.aliTemplateCode;
  const endpoint = 'dysmsapi.aliyuncs.com';

  const sendSmsRequest = new dysmsapi.SendSmsRequest({
    phoneNumbers: phone,
    signName,
    templateCode,
    templateParam: `{"code":${code}}`
  });

  const config = new OpenApi.Config({ accessKeyId, accessKeySecret, endpoint });
  const client = new Dysmsapi(config);
  const runtime = new Util.RuntimeOptions({});
  const res = await client.sendSmsWithOptions(sendSmsRequest, runtime);
  if (res.body.code !== 'OK') {
    return Promise.reject(res.body.message || '发送短信失败');
  }
};

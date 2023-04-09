import * as nodemailer from 'nodemailer';
import { EmailTypeEnum } from '@/constants/common';
import dayjs from 'dayjs';

const myEmail = process.env.MY_MAIL;
let mailTransport = nodemailer.createTransport({
  // host: 'smtp.qq.email',
  service: 'qq',
  secure: true, //安全方式发送,建议都加上
  auth: {
    user: myEmail,
    pass: process.env.MAILE_CODE
  }
});

const emailMap: { [key: string]: any } = {
  [EmailTypeEnum.register]: {
    subject: '注册 FastGPT 账号',
    html: (code: string) => `<div>您正在注册 FastGPT 账号，验证码为：${code}</div>`
  },
  [EmailTypeEnum.findPassword]: {
    subject: '修改 FastGPT 密码',
    html: (code: string) => `<div>您正在修改 FastGPT 账号密码，验证码为：${code}</div>`
  }
};

export const sendCode = (email: string, code: string, type: `${EmailTypeEnum}`) => {
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
        reject('邮箱异常');
      } else {
        resolve('');
      }
    });
  });
};

export const sendTrainSucceed = (email: string, modelName: string) => {
  return new Promise((resolve, reject) => {
    const options = {
      from: `"FastGPT" ${myEmail}`,
      to: email,
      subject: '模型训练完成通知',
      html: `你的模型 ${modelName} 已于 ${dayjs().format('YYYY-MM-DD HH:mm')} 训练完成！`
    };
    mailTransport.sendMail(options, function (err, msg) {
      if (err) {
        console.log('send email  error->', err);
        reject('邮箱异常');
      } else {
        resolve('');
      }
    });
  });
};

import { defineInputSchema } from '@/type';
import { getErrText } from '@/utils/err';
import { z } from 'zod';
import nodemailer from 'nodemailer';
export const InputType = defineInputSchema(
  z.object({
    smtpHost: z.string(),
    smtpPort: z.string(),
    SSL: z.boolean(),
    smtpUser: z.string(),
    smtpPass: z.string(),
    fromName: z.string().optional(),
    to: z.string(),
    subject: z.string(),
    content: z.string(),
    cc: z.string().optional(),
    bcc: z.string().optional(),
    attachments: z.string().optional()
  })
);

export const OutputType = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional()
});

const validateEmail = (email: string) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

const validateEmails = (emails: string) => {
  return emails.split(',').every((email) => validateEmail(email.trim()));
};

const main = async ({
  smtpHost,
  smtpPort,
  SSL,
  smtpUser,
  smtpPass,
  fromName,
  to,
  subject,
  content,
  cc,
  bcc,
  attachments
}: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> => {
  try {
    // 验证SMTP配置
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      throw new Error('Incomplete SMTP configuration');
    }

    // 验证必填参数
    if (!to || !subject || !content) {
      throw new Error('Recipient, subject, and content are required');
    }

    // 验证邮箱格式
    if (!validateEmails(to)) {
      throw new Error('Invalid recipient email format');
    }
    if (cc && !validateEmails(cc)) {
      throw new Error('Invalid CC email format');
    }
    if (bcc && !validateEmails(bcc)) {
      throw new Error('Invalid BCC email format');
    }

    // 创建SMTP传输对象
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: Number(smtpPort),
      secure: SSL === true,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    let attachmentsArray = [];
    try {
      attachmentsArray = JSON.parse(attachments || '[]');
    } catch (error) {
      throw new Error('Attachment format parsing error, please check attachment configuration');
    }

    // 发送邮件
    const info = await transporter.sendMail({
      from: `"${fromName || 'FastGPT'}" <${smtpUser}>`,
      to: to
        .split(',')
        .map((email) => email.trim())
        .join(','),
      cc: cc
        ?.split(',')
        .map((email) => email.trim())
        .join(','),
      bcc: bcc
        ?.split(',')
        .map((email) => email.trim())
        .join(','),
      subject,
      html: content,
      attachments: attachmentsArray || []
    });

    return {
      success: true,
      messageId: info.messageId
    };
  } catch (error: any) {
    return {
      success: false,
      error: getErrText(error)
    };
  }
};

export async function tool(props: z.infer<typeof InputType>): Promise<z.infer<typeof OutputType>> {
  return main(props);
}

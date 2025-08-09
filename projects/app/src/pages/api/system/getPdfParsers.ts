import type { NextApiRequest, NextApiResponse } from 'next';
import { jsonRes } from '@fastgpt/service/common/response';
import { authCert } from '@fastgpt/service/support/permission/auth/common';

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    await authCert({ req, authToken: true });

    const parsers = global.systemEnv?.customPdfParse || [];

    const parserOptions = parsers.map((parser) => {
      // 解析支持的文件格式
      const supportedFormats = parser.extension
        ? parser.extension.split(',').map((ext) => ext.trim().toLowerCase())
        : ['pdf'];

      const formatList = supportedFormats.map((format) => {
        return format.startsWith('.') ? format : `.${format}`;
      });

      const formatDescription = `支持格式: ${formatList.join(', ')}`;

      const fullDescription = parser.desc
        ? `${parser.desc} (${formatDescription})`
        : formatDescription;

      return {
        value: parser.name,
        label: parser.name,
        desc: fullDescription,
        price: parser.price || 0,
        supportedFormats: supportedFormats
      };
    });

    jsonRes(res, {
      data: parserOptions
    });
  } catch (err) {
    jsonRes(res, {
      code: 500,
      error: err
    });
  }
}

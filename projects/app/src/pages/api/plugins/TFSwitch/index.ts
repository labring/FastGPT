import type { NextApiRequest, NextApiResponse } from 'next';
// @ts-ignore
import type { HttpBodyType } from '@fastgpt/global/core/module/api.d';
import { getErrText } from '@fastgpt/global/common/error/utils';
import { authRequestFromLocal } from '@fastgpt/service/support/permission/auth/common';

type Props = HttpBodyType<{
  input: string;
  rule?: string;
}>;

export default async function handler(req: NextApiRequest, res: NextApiResponse<any>) {
  try {
    const { input, rule = '' } = req.body as Props;

    await authRequestFromLocal({ req });

    const result = (() => {
      if (typeof input === 'string') {
        const defaultReg: any[] = [
          '',
          undefined,
          'undefined',
          null,
          'null',
          false,
          'false',
          0,
          '0',
          'none'
        ];
        const customReg = rule.split('\n');
        defaultReg.push(...customReg);

        return !defaultReg.find((item) => {
          const reg = typeof item === 'string' ? stringToRegex(item) : null;
          if (reg) {
            return reg.test(input);
          }
          return input === item;
        });
      }

      return !!input;
    })();

    res.json({
      ...(result
        ? {
            true: true
          }
        : {
            false: false
          })
    });
  } catch (err) {
    console.log(err);
    res.status(500).send(getErrText(err));
  }
}

function stringToRegex(str: string) {
  const regexFormat = /^\/(.+)\/([gimuy]*)$/;
  const match = str.match(regexFormat);

  if (match) {
    const [, pattern, flags] = match;
    return new RegExp(pattern, flags);
  } else {
    return null;
  }
}

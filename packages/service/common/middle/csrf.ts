import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCsrfToken } from '../../support/permission/auth/common';
import { generateCsrfToken } from '../../../../projects/app/src/web/support/user/api';

export const withCSRFCheck = async (
  req: NextApiRequest,
  res: NextApiResponse,
  isCSRFCheck: boolean = true
) => {
  if (!isCSRFCheck) return;

  try {
    const csrfToken = await getCsrfTokenFromRequest(req);
    verifyCsrfToken(csrfToken || '');
  } catch (error) {
    return res.status(403).json({
      code: 403,
      message: 'Invalid CSRF token'
    });
  }
};

async function getCsrfTokenFromRequest(req: NextApiRequest): Promise<string | null> {
  const headerToken = req.headers['x-csrf-token'];

  if (!headerToken || typeof headerToken !== 'string') {
    const { csrfToken } = await generateCsrfToken();
    return csrfToken;
  }

  return headerToken;
}

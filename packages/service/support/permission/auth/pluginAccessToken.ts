import jwt from 'jsonwebtoken';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { z } from 'zod';
import type { NextApiRequest } from 'next';

const PLUGIN_ACCESS_TOKEN_SECRET =
  process.env.PLUGIN_ACCESS_TOKEN_SECRET || 'plugin_access_token_secret';
const PLUGIN_ACCESS_TOKEN_EXPIRES_IN: number = process.env.PLUGIN_ACCESS_TOKEN_EXPIRES_IN
  ? parseInt(process.env.PLUGIN_ACCESS_TOKEN_EXPIRES_IN)
  : 3600; // Default 1 hour (3600 seconds)

export const PluginAccessTokenPayloadSchema = z.object({
  tmbId: z.string(),
  teamId: z.string(),
  toolId: z.string()
});

export type PluginAccessTokenPayload = z.infer<typeof PluginAccessTokenPayloadSchema>;

/**
 * Generate plugin access token
 * JWT with tmbId and toolId in payload
 */
export const generatePluginAccessToken = (payload: PluginAccessTokenPayload): string => {
  const data = PluginAccessTokenPayloadSchema.parse(payload);

  const token = jwt.sign(data, PLUGIN_ACCESS_TOKEN_SECRET, {
    expiresIn: PLUGIN_ACCESS_TOKEN_EXPIRES_IN
  });

  return token;
};

/**
 * Verify and decode plugin access token
 * Returns the payload if valid, otherwise rejects with error
 */
export const authPluginAccessToken = ({
  req
}: {
  req: NextApiRequest;
}): Promise<PluginAccessTokenPayload> => {
  const token = req.headers.authorization?.split(' ')[1];

  return new Promise((resolve, reject) => {
    if (!token) {
      return reject(ERROR_ENUM.unAuthorization);
    }

    jwt.verify(token, PLUGIN_ACCESS_TOKEN_SECRET, (err, decoded: any) => {
      if (err) {
        return reject(ERROR_ENUM.unAuthorization);
      }

      try {
        const payload = PluginAccessTokenPayloadSchema.parse(decoded);
        return resolve(payload);
      } catch (error) {
        return reject(ERROR_ENUM.unAuthorization);
      }
    });
  });
};

import type { NextApiResponse } from 'next';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { jsonRes } from '@fastgpt/service/common/response';

// Define CustomNextApiHandler correctly
type CustomNextApiHandler<T = any> = (
  req: ApiRequestProps,
  res: NextApiResponse<T>
) => unknown | Promise<unknown>;

const VALIDATION_API_URL = 'http://172.28.17.114/api/ky/sys/validate-token';

interface TokenValidationSuccessResult {
  id: string;
  username: string;
  realname: string;
  avatar: string;
  birthday: string;
  [key: string]: any;
}

interface TokenValidationResponse {
  success: boolean;
  message: string;
  code: number;
  result?: TokenValidationSuccessResult | null;
  timestamp?: number;
}

// Augment ApiRequestProps to include our custom property
// This is a local augmentation for the purpose of this HOC.
// For global augmentation, a .d.ts file modifying the original module would be needed.
export interface ApiRequestPropsWithValidatedUser<Body = any, Query = any>
  extends ApiRequestProps<Body, Query> {
  validatedUserTokenData?: TokenValidationSuccessResult;
}

/**
 * A Higher-Order Component (HOC) to wrap Next.js API handlers for token validation.
 *
 * It extracts a 'token' from the URL query parameters.
 * If a token is present, it validates it against an external API.
 * - If validation is successful, the validated user data is attached to `req.validatedUserTokenData`
 *   and the original handler is called.
 * - If validation fails, or the token is missing, an appropriate error response is sent
 *   and the original handler is NOT called.
 *
 * @param handler The NextApiHandler to wrap.
 * @returns A new NextApiHandler with token validation logic.
 */
export function withTokenValidation(handler: CustomNextApiHandler): CustomNextApiHandler {
  return async (reqParam: ApiRequestProps, res: NextApiResponse): Promise<void> => {
    const req = reqParam as ApiRequestPropsWithValidatedUser;
    let token: string | null = null;
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    // const token = url.searchParams.get('token');
    token = url.searchParams.get('token') || url.searchParams.get('Token');

    // 2. If not found in URL, try headers
    if (!token) {
      const authHeader = req.headers?.authorization || req.headers?.Authorization;
      // 确保authHeader是string类型，因为headers可能是string[]
      const authHeaderStr = Array.isArray(authHeader) ? authHeader[0] : authHeader;

      if (
        authHeaderStr &&
        typeof authHeaderStr === 'string' &&
        authHeaderStr.startsWith('Bearer ')
      ) {
        token = authHeaderStr.substring(7);
      } else if (authHeaderStr && typeof authHeaderStr === 'string') {
        token = authHeaderStr;
      }

      // Try custom headers
      if (!token) {
        const getHeaderValue = (headerValue: string | string[] | undefined): string | null => {
          if (Array.isArray(headerValue)) {
            return headerValue[0] || null;
          }
          return headerValue || null;
        };

        token =
          getHeaderValue(req.headers?.['auth-token']) ||
          getHeaderValue(req.headers?.['x-token']) ||
          getHeaderValue(req.headers?.['token']) ||
          getHeaderValue(req.headers?.['Auth-Token']);
      }
    }

    // 3. If not found in headers, try request body
    if (!token && req.body) {
      token = req.body.token || req.body.Token || req.body.authToken;
    }

    console.log('[DEBUG] withTokenValidation token extraction:', {
      urlToken: url.searchParams.get('token') ? 'found' : 'not found',
      headerToken: !!(req.headers?.['auth-token'] || req.headers?.authorization)
        ? 'found'
        : 'not found',
      bodyToken: !!(req.body?.token || req.body?.Token) ? 'found' : 'not found',
      finalToken: token ? `${token.substring(0, 20)}...` : 'none'
    });

    if (!token) {
      jsonRes(res, {
        code: 401,
        message: 'Access token (token) is missing from the URL.'
      });
      return;
    }

    try {
      const validationUrl = `${VALIDATION_API_URL}?token=${encodeURIComponent(token)}`;
      const apiResponse = await fetch(validationUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const responseText = await apiResponse.text();
      let validationData: TokenValidationResponse;

      try {
        validationData = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Token validation API response is not valid JSON:', responseText);
        jsonRes(res, {
          code: 500,
          message: 'Token validation service returned an invalid response.'
        });
        return;
      }

      if (validationData.success && validationData.result) {
        req.validatedUserTokenData = validationData.result;
        await handler(req, res);
      } else {
        console.warn(
          `Token validation failed: ${validationData.message} (Code: ${validationData.code})`
        );
        jsonRes(res, {
          code: 401,
          message: validationData.message || 'Invalid or expired token.'
        });
      }
    } catch (error: any) {
      console.error('Error during token validation HTTP call:', error);
      jsonRes(res, {
        code: 502,
        message:
          'An error occurred while trying to validate the token with the authentication service.'
      });
    }
  };
}

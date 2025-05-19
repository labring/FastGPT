import { ApiType } from './type';

type OpenAPIParameter = {
  name: string;
  in: string;
  description: string;
  required: boolean;
  schema: {
    type: string;
  };
};

type OpenAPIResponse = {
  [code: string]: {
    description?: string;
    content: {
      [mediaType: string]: {
        schema: {
          type: string;
          properties?: {
            [key: string]: {
              type: string;
              description?: string;
            };
          };
        };
      };
    };
  };
};

type OpenAPISecurity = {
  apiKey?: string[];
  token?: string[];
};

type PathType = {
  [method: string]: {
    description: string;
    parameters: OpenAPIParameter[];
    security?: OpenAPISecurity[];
    responses: OpenAPIResponse;
  };
};

type PathsType = {
  [url: string]: PathType;
};

type OpenApiType = {
  openapi: string;
  info: {
    title: string;
    version: string;
    author: string;
  };
  paths: PathsType;
  servers?: {
    url: string;
  }[];
  components: {
    securitySchemes: {
      apiKey: {
        type: 'apiKey';
        name: 'Authorization';
        in: 'header';
        scheme: 'bearer';
      };
      token: {
        type: 'apiKey';
        in: 'token';
        name: 'token';
        scheme: 'basic';
      };
    };
  };
};

export function convertPath(api: ApiType): PathType {
  const method = api.method.toLowerCase();
  const parameters: any[] = [];
  if (api.query) {
    if (Array.isArray(api.query)) {
      api.query.forEach((item) => {
        parameters.push({
          name: item.key,
          description: item.comment,
          in: 'query',
          required: item.required,
          schema: {
            type: item.type
          }
        });
      });
    } else {
      parameters.push({
        description: api.query.comment,
        name: api.query.key,
        in: 'query',
        required: api.query.required,
        schema: {
          type: api.query.type
        }
      });
    }
  } else if (api.body) {
    if (Array.isArray(api.body)) {
      api.body.forEach((item) => {
        parameters.push({
          description: item.comment,
          name: item.key,
          in: 'body',
          required: item.required,
          schema: {
            type: item.type
          }
        });
      });
    }
  }

  const security: OpenAPISecurity[] = [];
  if (api.authorization === 'apikey') {
    security.push({
      apiKey: []
    });
  } else if (api.authorization === 'token') {
    security.push({
      token: []
    });
  }

  const responses: OpenAPIResponse = (() => {
    if (api.response) {
      if (Array.isArray(api.response)) {
        const properties: {
          [key: string]: {
            type: string;
            description?: string;
          };
        } = {};

        api.response.forEach((item) => {
          properties[item.type] = {
            type: item.key ?? item.type,
            description: item.comment
          };
        });
        const res: OpenAPIResponse = {
          '200': {
            description: api.description ?? '',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties
                }
              }
            }
          }
        };
        return res;
      } else {
        return {
          '200': {
            description: api.response.comment ?? '',
            content: {
              'application/json': {
                schema: {
                  type: api.response.type
                }
              }
            }
          }
        };
      }
    } else {
      return {
        '200': {
          description: api.description ?? '',
          content: {
            'application/json': {
              schema: {
                type: 'object'
              }
            }
          }
        }
      };
    }
  })();
  return {
    [method]: {
      description: api.description ?? '',
      security,
      parameters,
      responses
    }
  };
}
export function convertOpenApi({
  apis,
  ...rest
}: {
  apis: ApiType[];
} & Omit<OpenApiType, 'paths'>): OpenApiType {
  const paths: PathsType = {};
  apis.forEach((api) => {
    paths[api.url] = convertPath(api);
  });
  return {
    paths,
    ...rest
  };
}

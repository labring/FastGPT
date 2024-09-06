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
        };
      };
    };
  };
};

type OpenAPIPath = {
  [url: string]: {
    [method: string]: {
      description: string;
      parameters: OpenAPIParameter[];
      responses: OpenAPIResponse;
    };
  };
};

type PathType = {
  [method: string]: {
    description: string;
    parameters: any[];
    responses: any;
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

  const responses: any = {
    200: {
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            data: {
              type: 'object'
            }
          }
        },
        description: 'success'
      }
    }
  };

  return {
    [method]: {
      description: api.description ?? '',
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

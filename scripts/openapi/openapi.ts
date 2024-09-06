import { ApiType } from './type';
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
  };
  paths: PathsType;
};

export function convertPath(api: ApiType): PathType {
  const method = api.method.toLowerCase();
  const parameters: any[] = [];
  if (api.query) {
    if (Array.isArray(api.query)) {
      api.query.forEach((item) => {
        parameters.push({
          name: item.key,
          in: 'query',
          required: item.required,
          schema: {
            type: item.type
          }
        });
      });
    } else {
      parameters.push({
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

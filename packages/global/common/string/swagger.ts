import SwaggerParser from '@apidevtools/swagger-parser';

export const loadOpenAPISchemaFromUrl = async (url: string) => {
  return SwaggerParser.bundle(url);
};

export const checkOpenAPISchemaValid = async (str: string) => {
  try {
    const res = await SwaggerParser.validate(JSON.parse(str));
    console.log(res);
    return !!res;
  } catch (error) {
    return false;
  }
};

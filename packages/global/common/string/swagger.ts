/* v8 ignore file */
import SwaggerParser from '@apidevtools/swagger-parser';

export const loadOpenAPISchemaFromUrl = async (url: string) => {
  return SwaggerParser.bundle(url);
};

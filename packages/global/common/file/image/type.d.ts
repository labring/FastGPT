export enum ImageTypeEnum {
  AVATAR = 'avatar',
  IMAGE = 'image',
  LOGO_WIDE = 'logo_wide',
  LOGO_SQUARE = 'logo_square'
}

export type MongoImageSchemaType = {
  _id: string;
  teamId: string;
  binary: Buffer;
  expiredTime?: Date;
  type: `${ImageTypeEnum}`;

  metadata?: {
    mime?: string; // image mime type.
    relatedId?: string; // This id is associated with a set of images
  };
};

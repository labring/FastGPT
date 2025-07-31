export type MongoImageSchemaType = {
  _id: string;
  teamId: string;
  binary: Buffer;
  expiredTime?: Date;

  metadata?: {
    mime?: string; // image mime type.
    relatedId?: string; // This id is associated with a set of images
  };
};

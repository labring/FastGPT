import { connectToDatabase } from '@/service/mongo';
import { MongoOutLink } from '@fastgpt/service/support/outLink/schema';

/* get shareChat list by appId */
export default async function getOutLink(shareId: string) {
  try {
    return await MongoOutLink.find({
      shareId
    }).sort({
      _id: -1
    });
  } catch (err) {
    console.log(err);
  }
}

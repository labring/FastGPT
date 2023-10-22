import mongoose from './index';

export class MongoSession {
  tasks: (() => Promise<any>)[] = [];
  session: mongoose.mongo.ClientSession | null = null;
  opts: {
    session: mongoose.mongo.ClientSession;
    new: boolean;
  } | null = null;

  constructor() {}
  async init() {
    this.session = await mongoose.startSession();
    this.opts = { session: this.session, new: true };
  }
  push(
    tasks: ((opts: {
      session: mongoose.mongo.ClientSession;
      new: boolean;
    }) => () => Promise<any>)[] = []
  ) {
    if (!this.opts) return;
    // this.tasks = this.tasks.concat(tasks.map((item) => item(this.opts)));
  }
  async run() {
    if (!this.session || !this.opts) return;
    try {
      this.session.startTransaction();

      const opts = { session: this.session, new: true };

      await this.session.commitTransaction();
    } catch (error) {
      await this.session.abortTransaction();
      console.error(error);
    }
    this.session.endSession();
  }
}

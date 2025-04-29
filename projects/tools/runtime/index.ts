import { Command } from 'commander';
import express from 'express';
import { list, run } from './controllers';
import { init } from './utils/tools';

const app = express().use(express.json());
const program = new Command();

program
  .name('fastgpt-tools')
  .description('Run tools for FastGPT')
  .option('-p, --prod', 'Run in production mode')
  .option('-P, --port <port>', 'Specify the port to run on', '')
  .parse();

const prod = program.opts().prod as boolean;
const PORT = parseInt(program.opts().port || process.env.PORT || '3000');

init(prod); // init the tool

app.post('/run', run); // run a tool
app.get('/list', list); // get tools list

app.listen(PORT, (error?: Error) => {
  if (error) {
    console.error(error);
    process.exit(1);
  }
  console.log(`FastGPT Tool Service is listening at http://localhost:${PORT}`);
});

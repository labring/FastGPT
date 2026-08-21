#!/usr/bin/env node
import { runCli } from './run';

process.exitCode = await runCli({ argv: process.argv.slice(2) });

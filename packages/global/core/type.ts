import type { Agent } from 'http';

declare global {
  var httpsAgent: Agent;
}

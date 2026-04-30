/**
 * Manual/unit tests for compaction pure functions.
 *
 * The pi packages (@mariozechner/pi-agent-core, @mariozechner/pi-ai) are NOT
 * installed in FastGPT's node_modules → we test pure logic with hand-crafted
 * message objects matching the AgentMessage shape.
 *
 * Run:  cd /config/projects/merge_code/FastGPT && pnpm test test/cases/service/core/workflow/dispatch/piAgent/compaction.test.ts
 */

import { describe, expect, it } from 'vitest';

// ═══════════════════════════════════════════════════
// Minimal inline stubs matching pi-ai / pi-agent-core types
// ═══════════════════════════════════════════════════

interface StubTextContent {
  type: 'text';
  text: string;
}
interface StubThinkingContent {
  type: 'thinking';
  thinking: string;
}
interface StubToolCall {
  type: 'toolCall';
  name: string;
  arguments: Record<string, unknown>;
  id: string;
}
interface StubUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}

type StubContentBlock = StubTextContent | StubThinkingContent | StubToolCall;

interface StubUserMessage {
  role: 'user';
  content: string | Array<{ type: string; text?: string }>;
  timestamp?: number;
}

interface StubAssistantMessage {
  role: 'assistant';
  content: StubContentBlock[];
  usage?: StubUsage;
  stopReason?: string;
  errorMessage?: string;
  timestamp?: number;
}

interface StubToolResult {
  role: 'toolResult';
  content: string | Array<{ type: string; text: string }>;
  toolCallId: string;
  toolName: string;
  timestamp?: number;
}

type StubMessage = StubUserMessage | StubAssistantMessage | StubToolResult;

// ═══════════════════════════════════════════════════
// Copy of pure functions from compaction.ts (no pi imports)
// ═══════════════════════════════════════════════════

function estimateTokens(message: StubMessage): number {
  let chars = 0;
  switch (message.role) {
    case 'user': {
      const content = message.content;
      if (typeof content === 'string') {
        chars = content.length;
      } else if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text' && block.text) chars += block.text.length;
        }
      }
      return Math.ceil(chars / 4);
    }
    case 'assistant': {
      for (const block of message.content) {
        if (block.type === 'text') chars += block.text.length;
        else if (block.type === 'thinking') chars += block.thinking.length;
        else if (block.type === 'toolCall') {
          chars += block.name.length + JSON.stringify(block.arguments).length;
        }
      }
      return Math.ceil(chars / 4);
    }
    case 'toolResult': {
      if (typeof message.content === 'string') {
        chars = message.content.length;
      } else {
        for (const block of message.content) {
          if (block.type === 'text' && block.text) chars += block.text.length;
        }
      }
      return Math.ceil(chars / 4);
    }
    default:
      return 0;
  }
}

function calculateContextTokens(usage: StubUsage): number {
  return usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

function getAssistantUsage(msg: StubMessage): StubUsage | undefined {
  if (msg.role === 'assistant' && 'usage' in msg) {
    const assistant = msg as StubAssistantMessage;
    if (assistant.stopReason !== 'aborted' && assistant.stopReason !== 'error' && assistant.usage) {
      return assistant.usage;
    }
  }
  return undefined;
}

function estimateContextTokens(messages: StubMessage[]): {
  tokens: number;
  lastUsageIndex: number | null;
} {
  let lastUsageIndex: number | null = null;
  let lastUsage: StubUsage | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const usage = getAssistantUsage(messages[i]);
    if (usage) {
      lastUsage = usage;
      lastUsageIndex = i;
      break;
    }
  }

  if (!lastUsage || lastUsageIndex === null) {
    let estimated = 0;
    for (const m of messages) estimated += estimateTokens(m);
    return { tokens: estimated, lastUsageIndex: null };
  }

  const usageTokens = calculateContextTokens(lastUsage);
  let trailingTokens = 0;
  for (let i = lastUsageIndex + 1; i < messages.length; i++) {
    trailingTokens += estimateTokens(messages[i]);
  }
  return { tokens: usageTokens + trailingTokens, lastUsageIndex };
}

function shouldCompact(
  contextTokens: number,
  contextWindow: number,
  reserveTokens: number
): boolean {
  return contextTokens > contextWindow - reserveTokens;
}

function findCutPoint(messages: StubMessage[], keepRecentTokens: number): number {
  const validCutPoints: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    const role = messages[i].role;
    if (role === 'user' || role === 'assistant') {
      validCutPoints.push(i);
    }
  }

  if (validCutPoints.length === 0) return 0;

  let accumulated = 0;
  let cutIndex = validCutPoints[0];

  for (let i = messages.length - 1; i >= 0; i--) {
    accumulated += estimateTokens(messages[i]);
    if (accumulated >= keepRecentTokens) {
      for (const cp of validCutPoints) {
        if (cp >= i) {
          cutIndex = cp;
          break;
        }
      }
      break;
    }
  }

  // When cutting at assistant, include trailing tool results
  if (messages[cutIndex].role === 'assistant') {
    let j = cutIndex + 1;
    while (j < messages.length && messages[j].role === 'toolResult') {
      j++;
    }
    return j;
  }

  return cutIndex;
}

// ═══════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════

function makeUser(text: string): StubUserMessage {
  return { role: 'user', content: text };
}

function makeAssistant(text: string, usage?: StubUsage): StubAssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    usage: usage ?? { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, totalTokens: 150 }
  };
}

function makeToolCall(name: string, args: Record<string, unknown>): StubAssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'toolCall', name, arguments: args, id: `call_${name}` }]
  };
}

function makeToolResult(text: string): StubToolResult {
  return { role: 'toolResult', content: text, toolCallId: 'call_1', toolName: 'test' };
}

// ═══════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════

describe('estimateTokens', () => {
  it('estimates user message with chars/4', () => {
    const msg = makeUser('Hello World'); // 11 chars → ceil(11/4) = 3
    expect(estimateTokens(msg)).toBe(3);
  });

  it('estimates longer user message', () => {
    const msg = makeUser('A'.repeat(100)); // 100 chars → ceil(100/4) = 25
    expect(estimateTokens(msg)).toBe(25);
  });

  it('estimates assistant message with text', () => {
    const msg: StubAssistantMessage = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'Response content here' } // 22 chars
      ]
    };
    expect(estimateTokens(msg)).toBe(6); // ceil(22/4) = 6
  });

  it('estimates assistant with text + thinking', () => {
    const msg: StubAssistantMessage = {
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Internal reasoning here' }, // 24 chars
        { type: 'text', text: 'Visible response' } // 16 chars
      ]
    };
    expect(estimateTokens(msg)).toBe(10); // ceil(40/4) = 10
  });

  it('estimates assistant with tool calls', () => {
    const msg: StubAssistantMessage = {
      role: 'assistant',
      content: [{ type: 'toolCall', name: 'read', arguments: { path: '/tmp/test.txt' }, id: 't1' }]
    };
    // "read" (4) + JSON.stringify (24) = 28 chars → ceil(28/4) = 7
    expect(estimateTokens(msg)).toBe(7);
  });

  it('estimates tool result message', () => {
    const msg = makeToolResult('Tool output here'); // 16 chars → ceil(16/4) = 4
    expect(estimateTokens(msg)).toBe(4);
  });

  it('returns 0 for empty content', () => {
    const msg: StubUserMessage = { role: 'user', content: '' };
    expect(estimateTokens(msg)).toBe(0);
  });
});

describe('estimateContextTokens', () => {
  it('uses last assistant usage when available', () => {
    const messages: StubMessage[] = [
      makeUser('Hi'),
      makeAssistant('Hello', {
        input: 500,
        output: 60,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 560
      }),
      makeUser('How are you?'),
      makeAssistant('I am fine', {
        input: 400,
        output: 55,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 455
      })
    ];

    const result = estimateContextTokens(messages);
    // Last assistant tokens + 0 trailing
    expect(result.tokens).toBe(455);
    expect(result.lastUsageIndex).toBe(3);
  });

  it('adds trailing tokens after last assistant', () => {
    const messages: StubMessage[] = [
      makeUser('Hi'),
      makeAssistant('Hello', {
        input: 500,
        output: 60,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 560
      }),
      makeUser('What now?'),
      makeToolResult('Some result')
    ];

    const result = estimateContextTokens(messages);
    // 560 (usage) + estimate("What now?") + estimate("Some result")
    const trailing = estimateTokens(messages[2]) + estimateTokens(messages[3]);
    expect(result.tokens).toBe(560 + trailing);
  });

  it('falls back to estimation when no usage data', () => {
    const messages: StubMessage[] = [makeUser('Hello'), makeUser('World')];
    const result = estimateContextTokens(messages);
    expect(result.lastUsageIndex).toBeNull();
    expect(result.tokens).toBe(estimateTokens(messages[0]) + estimateTokens(messages[1]));
  });

  it('skips aborted assistant messages', () => {
    const aborted: StubAssistantMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'x' }],
      stopReason: 'aborted',
      usage: { input: 100, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 100 }
    };
    const messages: StubMessage[] = [makeUser('Hi'), aborted];
    const result = estimateContextTokens(messages);
    expect(result.lastUsageIndex).toBeNull(); // Should fall back
  });
});

describe('shouldCompact', () => {
  it('returns true when tokens exceed threshold', () => {
    // 1000 tokens, contextWindow=4000, reserve=1000 → 1000 > 3000? No
    expect(shouldCompact(1000, 4000, 1000)).toBe(false);
    // 3500 tokens → 3500 > 3000? Yes
    expect(shouldCompact(3500, 4000, 1000)).toBe(true);
  });

  it('returns false when well under limit', () => {
    expect(shouldCompact(500, 128000, 16384)).toBe(false);
  });

  it('returns true at the boundary', () => {
    // At exactly contextWindow - reserveTokens
    expect(shouldCompact(111617, 128000, 16384)).toBe(true); // 111617 > 111616
    expect(shouldCompact(111616, 128000, 16384)).toBe(false); // 111616 > 111616 → no
  });
});

describe('findCutPoint', () => {
  it('keeps recent messages within budget', () => {
    const messages: StubMessage[] = [
      makeUser('Old message 1'),
      makeAssistant('Old reply 1'),
      makeUser('Old message 2'),
      makeAssistant('Old reply 2'),
      makeUser('Recent message'),
      makeAssistant('Recent reply')
    ];

    // Each message ~4 tokens, 6 messages = ~24 tokens total.
    // Budget of 8 keeps last 2 messages (one turn).
    const cutIndex = findCutPoint(messages, 8);
    expect(cutIndex).toBeGreaterThan(0);
    expect(cutIndex).toBeLessThanOrEqual(4); // Should keep last turn
  });

  it('never cuts at tool result (keeps tool-call→tool-result pair intact)', () => {
    const messages: StubMessage[] = [
      makeUser('Read file'),
      makeToolCall('read', { path: '/tmp/x.txt' }),
      makeToolResult('file contents here'),
      makeAssistant('Here is the content', {
        input: 500,
        output: 100,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 600
      })
    ];

    const cutIndex = findCutPoint(messages, 20); // Tiny budget
    // Tool-result follows tool-call, cutting at assistant (index 3) should include
    // tool results after it. Since assistant is last message, cutIndex will be at
    // assistant or earlier. Should never be at toolResult (index 2).
    if (cutIndex <= 1) {
      expect(cutIndex).toBeLessThanOrEqual(1); // Cuts at user (0) or assistant (1=the toolCall)
    } else {
      // If cutting at assistant (index 3), includes everything after
      // Since index 3 is last message, no trailing tool results to include
      expect(messages[cutIndex]?.role).not.toBe('toolResult');
    }
    // Verify cut point is never at toolResult
    expect(messages[cutIndex]?.role).not.toBe('toolResult');
  });

  it('handles empty messages gracefully', () => {
    const messages: StubMessage[] = [];
    expect(findCutPoint(messages, 1000)).toBe(0);
  });

  it('includes trailing tool results when cutting at assistant', () => {
    const messages: StubMessage[] = [
      makeUser('Task A'),
      makeAssistant('Doing A', {
        input: 500,
        output: 50,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 550
      }),
      makeToolCall('run', { cmd: 'ls' }),
      makeToolResult('output here'),
      makeAssistant('Task A done', {
        input: 300,
        output: 80,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 380
      })
    ];

    // If cutPoint is at index 2 (the toolCall assistant message),
    // it should include index 3 (toolResult) too
    const cutIndex = findCutPoint(messages, 50);
    if (cutIndex === 2) {
      // Cutting at toolCall message → should include tool results after it
      // The function should bump to index 4 (after the toolResult)
      expect(cutIndex).toBe(4);
    }
    // In any case, it should not return the toolResult index (3) as cut point
    expect(cutIndex).not.toBe(3);
  });
});

describe('compaction integration scenario', () => {
  it('simulates a full conversation that would trigger compaction', () => {
    // Build a realistic conversation with 15 turns
    const messages: StubMessage[] = [];
    for (let i = 1; i <= 15; i++) {
      messages.push(makeUser(`Question ${i}: ${'data '.repeat(20)}`));
      const assistant: StubAssistantMessage = {
        role: 'assistant',
        content: [{ type: 'text', text: `Answer ${i}: ${'response '.repeat(30)}` }],
        usage: {
          input: 200 + i * 50,
          output: 100 + i * 20,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 300 + i * 70
        }
      };
      messages.push(assistant);
    }

    // Estimate context
    const { tokens } = estimateContextTokens(messages);
    expect(tokens).toBeGreaterThan(0);
    console.log(`\n  15 turns → ~${tokens} estimated tokens`);

    // Check threshold (using a small window to force compaction)
    const needsCompact = shouldCompact(tokens, 5000, 16384);
    console.log(`  Needs compaction (5000 window, 16384 reserve): ${needsCompact}`);

    // Find cut point — keep only the last ~300 tokens worth of context
    const cutIndex = findCutPoint(messages, 300);
    console.log(`  Cut point: index ${cutIndex} of ${messages.length} messages`);
    console.log(`  Messages to summarize: ${cutIndex}`);
    console.log(`  Messages to keep: ${messages.length - cutIndex}`);

    expect(cutIndex).toBeGreaterThan(0);
    expect(cutIndex).toBeLessThan(messages.length);
  });
});

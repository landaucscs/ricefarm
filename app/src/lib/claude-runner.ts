/**
 * Claude Multi-turn Tool Runner
 * Claude API의 tool_use를 자동으로 처리하는 공통 유틸리티.
 * count_words 등 서버사이드 tool을 자동 응답하고, 최종 결과를 수집합니다.
 */

import anthropic, { countWords } from './claude';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

interface ToolCallResult {
  toolName: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

interface RunResult {
  toolCalls: ToolCallResult[];
  textContent: string;
}

/**
 * Claude에게 메시지를 보내고, tool_use가 발생하면 자동으로 tool result를 제공하여
 * 대화를 완료합니다. 최대 maxTurns까지 반복.
 */
export async function runWithTools(options: {
  system: string;
  tools: Tool[];
  userMessage: string;
  maxTurns?: number;
  model?: string;
}): Promise<RunResult> {
  const { system, tools, userMessage, maxTurns = 5, model = 'claude-sonnet-4-20250514' } = options;

  const messages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [
    { role: 'user', content: userMessage },
  ];

  const allToolCalls: ToolCallResult[] = [];
  let textContent = '';

  for (let turn = 0; turn < maxTurns; turn++) {
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      system,
      tools,
      messages: messages as Parameters<typeof anthropic.messages.create>[0]['messages'],
    });

    // Collect text content
    for (const block of response.content) {
      if (block.type === 'text') {
        textContent += block.text;
      }
    }

    // If no tool use, we're done
    if (response.stop_reason !== 'tool_use') {
      console.log(`[claude-runner] model=${model} turn=${turn} stop=${response.stop_reason} tools=${allToolCalls.map(t=>t.toolName).join(',')||'none'} text=${textContent.substring(0,100)}`);
      break;
    }

    // Process tool calls and prepare results
    const toolResultBlocks: Array<{
      type: 'tool_result';
      tool_use_id: string;
      content: string;
    }> = [];

    for (const block of response.content) {
      if (block.type !== 'tool_use') continue;

      const input = block.input as Record<string, unknown>;
      let output: Record<string, unknown>;

      // Server-side tool handlers
      if (block.name === 'count_words') {
        const wc = countWords(String(input.text || ''));
        output = { word_count: wc };
      } else {
        // For tools like score_passage, generate_question, extract_passage:
        // These are "output" tools — Claude provides the data, we just acknowledge
        output = { status: 'received' };
      }

      allToolCalls.push({ toolName: block.name, input, output });

      toolResultBlocks.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(output),
      });
    }

    // Add assistant response + tool results to conversation
    messages.push({ role: 'assistant', content: response.content });
    messages.push({ role: 'user', content: toolResultBlocks });
  }

  return { toolCalls: allToolCalls, textContent };
}

/**
 * toolCalls에서 특정 tool의 input을 찾기
 */
export function findToolCall(result: RunResult, toolName: string): Record<string, unknown> | null {
  const call = result.toolCalls.find((c) => c.toolName === toolName);
  return call?.input ?? null;
}

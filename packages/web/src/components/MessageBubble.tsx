'use client';

import type { Message, ToolInvocation } from 'ai';
import { ChartRenderer, parseChartSpec } from './ChartRenderer';

interface Props {
  message: Message;
}

function extractChartFromInvocation(inv: ToolInvocation): ReturnType<typeof parseChartSpec> {
  if (inv.state !== 'result' || inv.toolName !== 'generate_visualization') return null;
  const result = inv.result as { content?: Array<{ type: string; text: string }> } | string | null;
  if (!result) return null;
  const text = typeof result === 'string'
    ? result
    : Array.isArray(result)
      ? (result as Array<{ text?: string }>)[0]?.text ?? ''
      : (result as { content?: Array<{ text?: string }> }).content?.[0]?.text ?? '';
  return parseChartSpec(text);
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === 'user';

  const charts = (message.toolInvocations ?? [])
    .map(extractChartFromInvocation)
    .filter(Boolean);

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      {message.content && (
        <div
          className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
            isUser ? 'bg-white/10 text-white/90' : 'text-white/80'
          }`}
        >
          {!isUser && (
            <span className="text-xs text-white/30 uppercase tracking-widest block mb-2">ADam</span>
          )}
          {message.content}
        </div>
      )}

      {charts.map((spec, i) =>
        spec ? (
          <div key={i} className="w-full max-w-[95%]">
            <ChartRenderer spec={spec} />
          </div>
        ) : null
      )}
    </div>
  );
}

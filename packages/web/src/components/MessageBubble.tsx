'use client';

import type { Message, ToolInvocation } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ChartRenderer, parseChartSpec } from './ChartRenderer';
import { Logo } from './Logo';

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

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-[var(--surface-2)] border border-[var(--border)] text-[var(--foreground)] px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-4 items-start">
      <div className="flex-shrink-0 mt-1 text-[var(--foreground)]">
        <Logo size={22} />
      </div>
      <div className="flex-1 min-w-0 space-y-3">
        {message.content && (
          <div className="prose-adam">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
          </div>
        )}
        {charts.map((spec, i) =>
          spec ? <ChartRenderer key={i} spec={spec} /> : null,
        )}
      </div>
    </div>
  );
}

'use client';

import { useChat } from 'ai/react';
import { MessageBubble } from './MessageBubble';
import { Logo } from './Logo';
import { useEffect, useRef } from 'react';
import { agentName } from '@/lib/branding';

const SUGGESTED_PROMPTS: { label: string; hint: string }[] = [
  { label: "Give me this morning's briefing", hint: 'Network revenue, eCPM, fill rate, top units' },
  { label: 'Which ad units dropped eCPM this week?', hint: 'Detect yield anomalies with inferred causes' },
  { label: 'Compare revenue WoW by SSP', hint: 'Side-by-side period comparison' },
  { label: 'Forecast available impressions for homepage', hint: 'Inventory projection from 30-day history' },
];

const CAPABILITIES: { name: string; description: string }[] = [
  { name: 'Delivery summary', description: 'Aggregate by date, ad unit, SSP, device, country' },
  { name: 'Pacing alerts', description: 'Under- or over-delivering line items' },
  { name: 'Yield anomalies', description: 'eCPM and fill drops vs. baseline period' },
  { name: 'Inventory forecast', description: 'Projected impressions for an ad unit' },
  { name: 'Period comparison', description: 'WoW, MoM, YoY, custom ranges' },
  { name: 'Audit logs', description: 'AdCP plan and decision audit trail' },
  { name: 'Inline charts', description: 'Recharts-powered visualizations' },
];

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat({
    api: '/api/chat',
  });

  const scrollerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [input]);

  const isEmpty = messages.length === 0;

  const inFlightToolName = isLoading
    ? messages[messages.length - 1]?.toolInvocations?.find((i) => i.state !== 'result')?.toolName ?? null
    : null;

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !isLoading && input.trim()) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto" ref={scrollerRef}>
        {isEmpty ? <EmptyState onPick={(content) => append({ role: 'user', content })} /> : (
          <ConversationSection>
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isLoading && <ThinkingIndicator toolName={inFlightToolName} />}
            <div ref={bottomRef} />
          </ConversationSection>
        )}
      </div>

      <ComposerSection
        textareaRef={textareaRef}
        input={input}
        onChange={handleInputChange}
        onSubmit={handleSubmit}
        onKeyDown={onKeyDown}
        isLoading={isLoading}
        isEmpty={isEmpty}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Section helpers
   ────────────────────────────────────────────────────────── */

function SectionLabel({ children, kicker }: { children: React.ReactNode; kicker?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <h2 className="text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--foreground-muted)]">
        {children}
      </h2>
      {kicker && (
        <span className="text-[11px] text-[var(--foreground-soft)]">{kicker}</span>
      )}
      <span className="flex-1 h-px bg-[var(--border)]" />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Empty state — Hero + Quick Start + Capabilities
   ────────────────────────────────────────────────────────── */

function EmptyState({ onPick }: { onPick: (content: string) => void }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-10">
      {/* Hero */}
      <section className="flex flex-col items-center text-center pt-4 pb-2">
        <div className="animate-rise text-[var(--foreground)]" style={{ animationDelay: '0ms' }}>
          <Logo size={42} />
        </div>
        <p className="mt-5 text-[10.5px] uppercase tracking-[0.2em] text-[var(--foreground-soft)] animate-rise" style={{ animationDelay: '60ms' }}>
          {agentName}
        </p>
        <h1 className="mt-3 text-[2.1rem] font-semibold text-[var(--foreground)] tracking-[-0.03em] leading-[1.05] animate-rise" style={{ animationDelay: '120ms' }}>
          What would you like to know?
        </h1>
        <p className="mt-3.5 text-[14.5px] text-[var(--foreground-muted)] max-w-md leading-relaxed animate-rise" style={{ animationDelay: '180ms' }}>
          Ask about network performance, eCPM trends, pacing, SSP mix, or inventory. Live data is fetched through MCP tools and explained inline.
        </p>
      </section>

      {/* Quick start */}
      <section className="animate-rise" style={{ animationDelay: '260ms' }}>
        <SectionLabel kicker="Try one to get started">Quick start</SectionLabel>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              onClick={() => onPick(prompt.label)}
              className="group text-left p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:border-[var(--foreground)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(20,18,12,0.05)] transition-all duration-200"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-[14px] font-medium text-[var(--foreground)] leading-snug">{prompt.label}</div>
                  <div className="text-[12.5px] text-[var(--foreground-soft)] mt-1 leading-snug">{prompt.hint}</div>
                </div>
                <ArrowIcon className="text-[var(--foreground-soft)] opacity-0 group-hover:opacity-100 group-hover:text-[var(--foreground)] transition-all duration-200 mt-0.5 flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Capabilities */}
      <section className="animate-rise" style={{ animationDelay: '340ms' }}>
        <SectionLabel kicker={`${CAPABILITIES.length} tools available via MCP`}>What I can do</SectionLabel>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          {CAPABILITIES.map((cap) => (
            <li key={cap.name} className="flex items-baseline gap-3 py-1.5 text-[13.5px]">
              <span className="text-[var(--foreground)] font-medium whitespace-nowrap">{cap.name}</span>
              <span className="flex-1 text-[var(--foreground-soft)] leading-snug">{cap.description}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Note */}
      <section className="animate-rise text-center pt-2" style={{ animationDelay: '420ms' }}>
        <p className="text-[12px] text-[var(--foreground-soft)] tracking-wide">
          Built on the open <a href="https://adcontextprotocol.org" target="_blank" rel="noreferrer" className="underline underline-offset-2 decoration-[var(--border-strong)] hover:decoration-[var(--foreground)] text-[var(--foreground-muted)]">Ad Context Protocol</a>. Tool responses include live data — never invented numbers.
        </p>
      </section>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Conversation section
   ────────────────────────────────────────────────────────── */

function ConversationSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-7">
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Composer section
   ────────────────────────────────────────────────────────── */

function ComposerSection({
  textareaRef,
  input,
  onChange,
  onSubmit,
  onKeyDown,
  isLoading,
  isEmpty,
}: {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  input: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  isEmpty: boolean;
}) {
  return (
    <div className="border-t border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur-md">
      <div className="max-w-3xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--foreground-muted)]">
            {isEmpty ? 'Compose' : 'Reply'}
          </span>
          <span className="text-[11px] text-[var(--foreground-soft)]">
            <kbd className="font-mono text-[10.5px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5">↵</kbd> to send,{' '}
            <kbd className="font-mono text-[10.5px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5">⇧</kbd>+
            <kbd className="font-mono text-[10.5px] bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5">↵</kbd> for newline
          </span>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (!isLoading && input.trim()) onSubmit(); }}>
          <div className="flex items-end gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3.5 py-3 shadow-[0_1px_2px_rgba(20,18,12,0.04)] focus-within:border-[var(--foreground)] focus-within:shadow-[0_2px_8px_rgba(20,18,12,0.06)] transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={onChange}
              onKeyDown={onKeyDown}
              placeholder={isEmpty ? `Ask ${agentName} a question…` : 'Continue the conversation…'}
              rows={1}
              className="flex-1 resize-none bg-transparent text-[15px] text-[var(--foreground)] outline-none placeholder:text-[var(--foreground-soft)] py-1 leading-snug"
              disabled={isLoading}
              autoFocus
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent)] text-[var(--accent-fg)] disabled:bg-[var(--surface-3)] disabled:text-[var(--foreground-soft)] hover:bg-[var(--accent-hover)] active:scale-95 transition-all duration-150 flex-shrink-0"
            >
              <SendIcon />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   Indicators + icons
   ────────────────────────────────────────────────────────── */

function ThinkingIndicator({ toolName }: { toolName: string | null }) {
  const label = toolName ? prettyToolName(toolName) : 'Thinking';
  return (
    <div className="flex items-center gap-3 text-[13px] text-[var(--foreground-muted)]">
      <Logo size={20} className="text-[var(--foreground-muted)] opacity-60" />
      <span className="flex items-center gap-2">
        <span>{label}</span>
        <span className="flex gap-0.5">
          <span className="w-1 h-1 rounded-full bg-[var(--foreground-soft)] animate-bounce [animation-delay:0ms]" />
          <span className="w-1 h-1 rounded-full bg-[var(--foreground-soft)] animate-bounce [animation-delay:150ms]" />
          <span className="w-1 h-1 rounded-full bg-[var(--foreground-soft)] animate-bounce [animation-delay:300ms]" />
        </span>
      </span>
    </div>
  );
}

function prettyToolName(name: string): string {
  const human: Record<string, string> = {
    get_morning_briefing: 'Pulling morning briefing',
    get_delivery_summary: 'Fetching delivery report',
    get_pacing_alerts: 'Checking pacing alerts',
    get_yield_anomalies: 'Detecting yield anomalies',
    get_inventory_forecast: 'Forecasting inventory',
    compare_periods: 'Comparing periods',
    get_plan_audit_logs: 'Reading audit logs',
    generate_visualization: 'Rendering chart',
    get_adcp_capabilities: 'Loading capabilities',
  };
  return human[name] ?? name.replace(/_/g, ' ');
}

function SendIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="7" y1="17" x2="17" y2="7" />
      <polyline points="9 7 17 7 17 15" />
    </svg>
  );
}

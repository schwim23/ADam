'use client';

import { useChat } from 'ai/react';
import { MessageBubble } from './MessageBubble';
import { useEffect, useRef } from 'react';

const SUGGESTED_PROMPTS = [
  "Give me this morning's briefing",
  'Which ad units dropped eCPM this week?',
  'Compare revenue WoW by SSP',
  'Forecast available impressions for homepage',
];

export function Chat() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/chat',
  });

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto px-4">
      {isEmpty ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-8">
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-white/90 mb-2">ADam</h1>
            <p className="text-white/40 text-sm">Agentic ad operations on AdCP</p>
          </div>
          <div className="grid grid-cols-2 gap-2 w-full">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  handleInputChange({ target: { value: prompt } } as React.ChangeEvent<HTMLInputElement>);
                }}
                className="text-left p-3 rounded-lg border border-white/10 text-white/60 text-sm hover:border-white/20 hover:text-white/80 transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-6 space-y-4">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isLoading && (
            <div className="flex gap-1 px-4 py-3">
              <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 rounded-full bg-white/30 animate-bounce [animation-delay:300ms]" />
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <form onSubmit={handleSubmit} className="py-4">
        <div className="flex gap-2 items-center border border-white/10 rounded-xl px-4 py-3 focus-within:border-white/25 transition-colors">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="Ask ADam anything about your campaigns..."
            className="flex-1 bg-transparent text-white/90 text-sm outline-none placeholder:text-white/30"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="text-white/40 hover:text-white/80 disabled:opacity-30 transition-colors text-sm"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

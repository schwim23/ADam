import { Chat } from '@/components/Chat';
import { Logo } from '@/components/Logo';
import { agentName, agentTagline } from '@/lib/branding';

export default function Home() {
  return (
    <main className="flex flex-col h-screen bg-[var(--background)]">
      <header className="flex items-center justify-between px-6 h-14 border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Logo size={22} className="text-[var(--foreground)]" />
          <div className="flex items-baseline gap-2">
            <span className="text-[15px] font-medium text-[var(--foreground)] tracking-tight">{agentName}</span>
            <span className="text-[12px] text-[var(--foreground-soft)]">·</span>
            <span className="text-[12px] text-[var(--foreground-soft)]">{agentTagline}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-[var(--foreground-soft)]">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--positive)] animate-pulse-soft" />
          Live
        </div>
      </header>
      <div className="flex-1 overflow-hidden">
        <Chat />
      </div>
    </main>
  );
}

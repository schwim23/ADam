import { Chat } from '@/components/Chat';

export default function Home() {
  return (
    <main className="flex flex-col h-screen">
      <header className="flex items-center gap-3 px-6 py-4 border-b border-white/10">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-sm font-semibold tracking-widest uppercase text-white/70">ADam</span>
        <span className="text-xs text-white/30">agentic ad operations · AdCP</span>
      </header>
      <div className="flex-1 overflow-hidden">
        <Chat />
      </div>
    </main>
  );
}

import { useEffect, useState } from "react";

const DEADLINE = new Date("2026-09-30T23:59:59-03:00").getTime();

export function CountdownBar() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const diff = Math.max(0, DEADLINE - now);
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);

  return (
    <div className="bg-navy text-white border-b border-gold/30">
      <div className="px-6 py-2.5 flex items-center justify-center gap-3 text-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-gold animate-pulse" />
        <span className="text-gold/90 font-medium tracking-wide">
          ⏰ Faltam <span className="num-display text-gold">{days}</span> dias
          {" "}e <span className="num-display text-gold">{hours}h</span> para o prazo de opção pelo Simples Híbrido
        </span>
        <span className="text-white/60">· 30/09/2026</span>
      </div>
    </div>
  );
}

interface Props {
  variant?: "navy" | "gold" | "white";
  size?: "sm" | "md" | "lg";
}

const sizes = { sm: "text-base", md: "text-xl", lg: "text-3xl" };

export function RecordLogo({ variant = "navy", size = "md" }: Props) {
  const main =
    variant === "white" ? "text-white" : variant === "gold" ? "text-gold" : "text-navy";
  const accent = variant === "navy" ? "text-gold" : "text-gold";
  return (
    <div className={`flex items-baseline gap-1.5 ${sizes[size]} font-display font-bold tracking-tight`}>
      <span className={main}>Record</span>
      <span className={`h-1.5 w-1.5 rounded-full ${variant === "white" ? "bg-gold" : "bg-gold"}`} />
      <span className={`${accent} text-[0.6em] uppercase tracking-[0.25em] font-sans font-medium`}>
        Record Hub
      </span>
    </div>
  );
}

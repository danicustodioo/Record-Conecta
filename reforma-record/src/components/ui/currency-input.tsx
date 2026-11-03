import * as React from "react";
import { Input } from "@/components/ui/input";

interface CurrencyInputProps extends Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> {
  value: number | null | undefined;
  onChange: (value: number) => void;
}

// Formats a number as Brazilian currency without symbol: 39.999.792,23
function formatBR(n: number): string {
  if (!isFinite(n)) return "";
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

// Interpreta o texto no padrão pt-BR: pontos são separadores de milhar e a
// vírgula é o separador decimal. Sem vírgula, os dígitos valem REAIS inteiros
// (23.917.893 => 23917893), nunca centavos.
export function parseCurrencyBR(texto: string): number {
  const limpo = texto.replace(/[^\d,.-]/g, "");
  if (!limpo) return 0;
  const negativo = limpo.trim().startsWith("-");
  const semSinal = limpo.replace(/-/g, "");
  const partes = semSinal.split(",");
  const inteiros = partes[0].replace(/\./g, "");
  const decimais = partes.length > 1 ? partes.slice(1).join("").slice(0, 2) : "";
  const n = Number(`${inteiros || "0"}.${decimais || "0"}`);
  if (!Number.isFinite(n)) return 0;
  return negativo ? -n : n;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, ...props }, ref) => {
    const [texto, setTexto] = React.useState<string | null>(null);
    const display = texto ?? (value == null || isNaN(value) ? "" : formatBR(value));
    return (
      <Input
        {...props}
        ref={ref}
        inputMode="decimal"
        value={display}
        onChange={(e) => {
          setTexto(e.target.value);
          onChange(parseCurrencyBR(e.target.value));
        }}
        onBlur={(e) => {
          setTexto(null);
          props.onBlur?.(e);
        }}
      />
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

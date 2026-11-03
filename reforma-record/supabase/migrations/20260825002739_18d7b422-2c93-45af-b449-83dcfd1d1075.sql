ALTER TABLE public.analises
  ADD COLUMN IF NOT EXISTS saldo_credor_cbs numeric(14,2),
  ADD COLUMN IF NOT EXISTS conferido_por text;
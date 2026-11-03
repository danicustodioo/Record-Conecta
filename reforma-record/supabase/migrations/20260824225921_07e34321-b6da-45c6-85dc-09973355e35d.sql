ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS iss_aliquota_efetiva numeric(8,6),
  ADD COLUMN IF NOT EXISTS pct_empreitada numeric(5,2),
  ADD COLUMN IF NOT EXISTS pct_creditavel numeric(5,2),
  ADD COLUMN IF NOT EXISTS base_creditavel_estimada numeric(15,2);
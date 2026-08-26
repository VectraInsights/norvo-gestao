-- Adiciona coluna last_nsu para persistir cursor da SEFAZ NFeDistribuicaoDFe
-- Evita cStat 656 "Consumo Indevido" que ocorre quando ultNSU não é retomado
ALTER TABLE public.nfe_config
  ADD COLUMN IF NOT EXISTS last_nsu TEXT DEFAULT NULL;

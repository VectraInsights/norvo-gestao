-- Tipo 'transporte' p/ contatos do fiscal (decisão do dono 15/10; substitui 'transportadora').
-- IMPORTANTE: ALTER TYPE ... ADD VALUE não roda dentro de bloco de transação.
-- Rode o ALTER abaixo SOZINHO primeiro; depois os UPDATEs. Por fim, rode na mesma
-- sessão: NOTIFY pgrst, 'reload schema'; (atualiza o cache da API).
ALTER TYPE public.contato_tipo ADD VALUE IF NOT EXISTS 'transporte';

-- Vira p/ transporte o que entrou como transportadora (form/CT-e após o deploy):
UPDATE public.contatos SET tipo = 'transporte' WHERE tipo = 'transportadora';

-- Vira p/ transporte os 7 da migração que entraram como cliente (troque os ids
-- pelos do SELECT abaixo; são os 7 com o mesmo created_at do minuto da migração):
-- SELECT id, nome, documento, created_at FROM public.contatos
--  WHERE tipo = 'cliente' ORDER BY created_at DESC LIMIT 15;
-- UPDATE public.contatos SET tipo = 'transporte' WHERE id IN ('...', ...);

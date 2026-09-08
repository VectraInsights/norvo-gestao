-- IE no cadastro de contatos (usado no lookup de Consignatário/Redespacho do CT-e)
ALTER TABLE public.contatos ADD COLUMN IF NOT EXISTS ie TEXT;

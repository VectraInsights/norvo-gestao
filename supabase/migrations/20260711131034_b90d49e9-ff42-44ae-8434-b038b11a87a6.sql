
-- Phase 4: Projects / Service Orders

CREATE TYPE public.projeto_status AS ENUM ('planejado','em_andamento','pausado','concluido','cancelado');
CREATE TYPE public.os_status AS ENUM ('aberta','em_execucao','aguardando','concluida','cancelada','faturada');
CREATE TYPE public.os_prioridade AS ENUM ('baixa','media','alta','urgente');

CREATE TABLE public.projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  cliente_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  status public.projeto_status NOT NULL DEFAULT 'planejado',
  data_inicio DATE,
  data_prevista DATE,
  data_conclusao DATE,
  orcamento NUMERIC(15,2) DEFAULT 0,
  cor TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT ALL ON public.projetos TO service_role;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros gerenciam projetos" ON public.projetos FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER trg_projetos_touch BEFORE UPDATE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE TABLE public.ordens_servico (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  numero INT,
  projeto_id UUID REFERENCES public.projetos(id) ON DELETE SET NULL,
  cliente_id UUID REFERENCES public.contatos(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  descricao TEXT,
  status public.os_status NOT NULL DEFAULT 'aberta',
  prioridade public.os_prioridade NOT NULL DEFAULT 'media',
  responsavel_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  data_abertura DATE NOT NULL DEFAULT CURRENT_DATE,
  data_prevista DATE,
  data_conclusao DATE,
  valor NUMERIC(15,2) DEFAULT 0,
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ordens_servico TO authenticated;
GRANT ALL ON public.ordens_servico TO service_role;
ALTER TABLE public.ordens_servico ENABLE ROW LEVEL SECURITY;
CREATE POLICY "membros gerenciam OS" ON public.ordens_servico FOR ALL TO authenticated
  USING (public.is_empresa_member(empresa_id, auth.uid()))
  WITH CHECK (public.is_empresa_member(empresa_id, auth.uid()));
CREATE TRIGGER trg_os_touch BEFORE UPDATE ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.tg_touch_updated_at();

CREATE OR REPLACE FUNCTION public.tg_os_numero()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE prox INT;
BEGIN
  IF NEW.numero IS NULL THEN
    SELECT COALESCE(MAX(numero),0)+1 INTO prox
      FROM public.ordens_servico WHERE empresa_id = NEW.empresa_id;
    NEW.numero := prox;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_os_numero BEFORE INSERT ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.tg_os_numero();

-- NF-es pendentes: endereço/IE/fone de emitente e destinatário (lidos do XML)
-- (aplicada via Management API em 30/09/2026; arquivo mantido p/ registro)
alter table public.cte_nfes_pendentes add column if not exists emit_ie text;
alter table public.cte_nfes_pendentes add column if not exists emit_logradouro text;
alter table public.cte_nfes_pendentes add column if not exists emit_nro text;
alter table public.cte_nfes_pendentes add column if not exists emit_bairro text;
alter table public.cte_nfes_pendentes add column if not exists emit_cep text;
alter table public.cte_nfes_pendentes add column if not exists emit_fone text;
alter table public.cte_nfes_pendentes add column if not exists dest_ie text;
alter table public.cte_nfes_pendentes add column if not exists dest_logradouro text;
alter table public.cte_nfes_pendentes add column if not exists dest_nro text;
alter table public.cte_nfes_pendentes add column if not exists dest_bairro text;
alter table public.cte_nfes_pendentes add column if not exists dest_cep text;
alter table public.cte_nfes_pendentes add column if not exists dest_fone text;

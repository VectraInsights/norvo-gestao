-- Colaboradores: data de nascimento + endereço (cadastro RH)
alter table public.colaboradores
  add column if not exists data_nascimento date,
  add column if not exists logradouro text,
  add column if not exists numero text,
  add column if not exists complemento text,
  add column if not exists bairro text,
  add column if not exists cidade text,
  add column if not exists uf text,
  add column if not exists cep text;

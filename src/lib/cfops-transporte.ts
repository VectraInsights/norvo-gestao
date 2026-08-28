export interface CodigoCfop {
  codigo: string;
  descricao: string;
}

export const CFOPS_TRANSPORTE: CodigoCfop[] = [
  { codigo: "1352", descricao: "1.352 — Remetente (Dentro UF)" },
  { codigo: "2352", descricao: "2.352 — Remetente (Fora UF)" },
  { codigo: "5352", descricao: "5.352 — Remetente (Dentro UF)" },
  { codigo: "6352", descricao: "6.352 — Remetente (Fora UF)" },
  { codigo: "1353", descricao: "1.353 — Expedidor (Dentro UF)" },
  { codigo: "2353", descricao: "2.353 — Expedidor (Fora UF)" },
  { codigo: "5353", descricao: "5.353 — Expedidor (Dentro UF)" },
  { codigo: "6353", descricao: "6.353 — Expedidor (Fora UF)" },
  { codigo: "1354", descricao: "1.354 — Recebedor (Dentro UF)" },
  { codigo: "2354", descricao: "2.354 — Recebedor (Fora UF)" },
  { codigo: "5354", descricao: "5.354 — Recebedor (Dentro UF)" },
  { codigo: "6354", descricao: "6.354 — Recebedor (Fora UF)" },
  { codigo: "1355", descricao: "1.355 — Destinatário (Dentro UF)" },
  { codigo: "2355", descricao: "2.355 — Destinatário (Fora UF)" },
  { codigo: "5355", descricao: "5.355 — Destinatário (Dentro UF)" },
  { codigo: "6355", descricao: "6.355 — Destinatário (Fora UF)" },
  { codigo: "1356", descricao: "1.356 — Outros (Dentro UF)" },
  { codigo: "2356", descricao: "2.356 — Outros (Fora UF)" },
  { codigo: "5356", descricao: "5.356 — Outros (Dentro UF)" },
  { codigo: "6356", descricao: "6.356 — Outros (Fora UF)" },
  { codigo: "1357", descricao: "1.357 — Redespacho (Dentro UF)" },
  { codigo: "2357", descricao: "2.357 — Redespacho (Fora UF)" },
  { codigo: "5357", descricao: "5.357 — Redespacho (Dentro UF)" },
  { codigo: "6357", descricao: "6.357 — Redespacho (Fora UF)" },
];

export const MOD_FRETE_OPTIONS = [
  { value: "0", label: "0 — Contratação do Frete por conta do Remetente (CIF)" },
  { value: "1", label: "1 — Contratação do Frete por conta do Destinatário (FOB)" },
  { value: "2", label: "2 — Contratação do Frete por conta de Terceiros" },
  { value: "3", label: "3 — Transporte Próprio por conta do Remetente" },
  { value: "4", label: "4 — Transporte Próprio por conta do Destinatário" },
  { value: "9", label: "9 — Sem Ocorrência de Transporte" },
];

export const RESPONSAVEL_CTE_OPTIONS = [
  { value: "0", label: "0 — Remetente" },
  { value: "1", label: "1 — Expedidor" },
  { value: "2", label: "2 — Recebedor" },
  { value: "3", label: "3 — Destinatário" },
  { value: "4", label: "4 — Emitente do CT-e" },
  { value: "5", label: "5 — Tomador de Serviço" },
];

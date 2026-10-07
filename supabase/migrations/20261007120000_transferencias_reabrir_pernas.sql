-- Reabre pernas de transferência criadas como "pago" antes da correção:
-- elas nunca apareceram na conciliação (que só lista aberto/vencido/parcial).
-- Só reabre quem NÃO foi vinculado ao extrato (ofx_transacoes.lancamento_id).
UPDATE lancamentos_financeiros
SET status = 'aberto',
    valor_pago = NULL,
    data_pagamento = NULL
WHERE transferencia_id IS NOT NULL
  AND status = 'pago'
  AND id NOT IN (
    SELECT lancamento_id FROM ofx_transacoes WHERE lancamento_id IS NOT NULL
  );

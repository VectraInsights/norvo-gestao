const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r1 = await p.query(`UPDATE folha_pagamento SET status='aberta', lancamento_id=NULL WHERE competencia_mes=8 AND competencia_ano=2026 AND status='lançada'`);
  console.log('Updated:', r1.rowCount);
  const r2 = await p.query(`SELECT f.id, f.status, f.lancamento_id FROM folha_pagamento f WHERE f.competencia_mes=8 AND f.competencia_ano=2026`);
  console.log(JSON.stringify(r2.rows, null, 2));
  await p.end();
})();

const { Pool } = require('pg');
const p = new Pool({ connectionString: process.env.DATABASE_URL });
(async () => {
  const r1 = await p.query(`SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'trg_lancamento_delete_folha'`);
  console.log('Trigger:', JSON.stringify(r1.rows));
  const r2 = await p.query(`SELECT prosrc FROM pg_proc WHERE proname = 'tg_lancamento_delete_sincroniza_folha'`);
  console.log('Function exists:', r2.rows.length > 0);
  if (r2.rows.length > 0) console.log('Function body:', r2.rows[0].prosrc);
  await p.end();
})();

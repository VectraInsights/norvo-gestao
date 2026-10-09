// Seed da tabela `ncm` a partir do JSON oficial do Classif/Siscomex.
// Uso:
//   $env:SUPABASE_URL="https://xxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
//   node scripts/seed-ncm.mjs
// Reexecute sempre que sair nova Resolução Gecex (o script informa a vigente).
const NCM_URL =
  "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente antes de rodar.",
  );
  process.exit(1);
}

const brToIso = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || "").trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

async function main() {
  console.log("Baixando JSON oficial do Classif/Siscomex...");
  const res = await fetch(NCM_URL, { redirect: "follow" });
  if (!res.ok) throw new Error(`Download falhou: HTTP ${res.status}`);
  const json = await res.json();
  const lista = json.Nomenclaturas || [];
  console.log(
    `Vigente em: ${json.Data_Ultima_Atualizacao_NCM} | Ato: ${json.Ato} | Registros: ${lista.length}`,
  );

  const rows = [];
  for (const r of lista) {
    const codigo = String(r.Codigo || "").replace(/\D/g, "");
    if (codigo.length !== 8) continue; // só NCMs completos (capítulos/posições ficam de fora)
    rows.push({
      codigo,
      descricao: String(r.Descricao || "").trim(),
      data_inicio: brToIso(r.Data_Inicio),
      data_fim: brToIso(r.Data_Fim),
      ato:
        [r.Tipo_Ato_Ini, r.Numero_Ato_Ini, r.Ano_Ato_Ini]
          .filter(Boolean)
          .join(" ") || null,
    });
  }
  console.log(`NCMs de 8 dígitos: ${rows.length}`);

  const TAM_LOTE = 1000;
  let ok = 0;
  for (let i = 0; i < rows.length; i += TAM_LOTE) {
    const lote = rows.slice(i, i + TAM_LOTE);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/ncm`, {
      method: "POST",
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify(lote),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`Upsert falhou (${r.status}): ${txt.slice(0, 300)}`);
    }
    ok += lote.length;
    console.log(`  ${ok}/${rows.length}`);
  }
  console.log(`OK: ${ok} NCMs gravados em ${SUPABASE_URL}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

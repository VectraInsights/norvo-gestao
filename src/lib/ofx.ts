// Minimal OFX (SGML/XML) parser — extrai transações STMTTRN.
export type OfxTx = {
  fitid: string;
  data: string; // yyyy-mm-dd
  valor: number;
  tipo: string; // CREDIT / DEBIT / etc
  memo: string;
};

function parseDate(raw: string): string {
  // Ex: 20260315120000[-3:BRT] → 2026-03-15
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : new Date().toISOString().slice(0, 10);
}

function tag(block: string, name: string): string {
  // Aceita <NAME>valor ou <NAME>valor</NAME>
  const re = new RegExp(`<${name}>([^<\\r\\n]*)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

export function parseOfx(content: string): OfxTx[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  return blocks.map((b) => {
    const valor = Number(tag(b, "TRNAMT").replace(",", "."));
    return {
      fitid: tag(b, "FITID") || `${tag(b, "DTPOSTED")}-${tag(b, "TRNAMT")}`,
      data: parseDate(tag(b, "DTPOSTED")),
      valor: isNaN(valor) ? 0 : valor,
      tipo: tag(b, "TRNTYPE") || (valor >= 0 ? "CREDIT" : "DEBIT"),
      memo: tag(b, "MEMO") || tag(b, "NAME") || "",
    };
  }).filter((t) => t.fitid);
}

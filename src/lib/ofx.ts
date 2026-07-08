// Minimal OFX (SGML/XML) parser — extrai transações STMTTRN e dados da conta.
export type OfxTx = {
  fitid: string;
  data: string; // yyyy-mm-dd
  valor: number;
  tipo: string; // CREDIT / DEBIT / etc
  memo: string;
};

export type OfxAccount = {
  bankId: string;   // BANKID (código COMPE)
  branchId: string; // BRANCHID (agência)
  acctId: string;   // ACCTID (conta)
  acctType: string; // ACCTTYPE
};

export type OfxParsed = {
  account: OfxAccount;
  transactions: OfxTx[];
};

function parseDate(raw: string): string {
  const m = raw.match(/^(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : new Date().toISOString().slice(0, 10);
}

function tag(block: string, name: string): string {
  const re = new RegExp(`<${name}>([^<\\r\\n]*)`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : "";
}

export function parseOfxAccount(content: string): OfxAccount {
  const block = content.match(/<BANKACCTFROM>[\s\S]*?<\/BANKACCTFROM>/i)?.[0]
    ?? content.match(/<CCACCTFROM>[\s\S]*?<\/CCACCTFROM>/i)?.[0]
    ?? "";
  return {
    bankId: tag(block, "BANKID"),
    branchId: tag(block, "BRANCHID"),
    acctId: tag(block, "ACCTID"),
    acctType: tag(block, "ACCTTYPE"),
  };
}

export function parseOfxTransactions(content: string): OfxTx[] {
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) ?? [];
  return blocks.map((b, idx) => {
    const valor = Number(tag(b, "TRNAMT").replace(",", "."));
    const rawFitid = tag(b, "FITID");
    // Fallback estável quando o banco não envia FITID: inclui índice para não
    // colapsar duas transações reais de mesmo dia e valor.
    const fitid = rawFitid || `${tag(b, "DTPOSTED")}-${tag(b, "TRNAMT")}-${idx}`;
    return {
      fitid,
      data: parseDate(tag(b, "DTPOSTED")),
      valor: isNaN(valor) ? 0 : valor,
      tipo: tag(b, "TRNTYPE") || (valor >= 0 ? "CREDIT" : "DEBIT"),
      memo: tag(b, "MEMO") || tag(b, "NAME") || "",
    };
  }).filter((t) => t.fitid);
}

export function parseOfx(content: string): OfxTx[] {
  return parseOfxTransactions(content);
}

export function parseOfxFull(content: string): OfxParsed {
  return {
    account: parseOfxAccount(content),
    transactions: parseOfxTransactions(content),
  };
}

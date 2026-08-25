// Teste direto de conexão SEFAZ com certificado
// Rode: node test-sefaz.mjs <caminho.pfx> <senha> <cnpj>

import https from "node:https";
import fs from "node:fs";
import forge from "node-forge";

const pfxPath = process.argv[2];
const senha = process.argv[3];
const cnpj = process.argv[4] || "00000000000000";

if (!pfxPath || !senha) {
  console.log("Uso: node test-sefaz.mjs <caminho.pfx> <senha> [cnpj]");
  process.exit(1);
}

const pfxBytes = fs.readFileSync(pfxPath);
console.log(`Certificado: ${pfxPath} (${pfxBytes.length} bytes)`);

// 1. Testar HTTPS com certificado para SVRS
const url = new URL("https://nfe-homologacao.svrs.rs.gov.br/WsNFeStatusServico4/NFeStatusServico4.asmx");

const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">
  <soap12:Body>
    <nfeStatusServicoNF xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
      <nfeDadosMsg>
        <consStatServ xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
          <tpAmb>2</tpAmb>
          <xServ>STATUS</xServ>
          <cUF>43</cUF>
        </consStatServ>
      </nfeDadosMsg>
    </nfeStatusServicoNF>
  </soap12:Body>
</soap12:Envelope>`;

console.log("\nTestando conexao com SVRS Status Servico...");
console.log(`URL: ${url.href}`);

const agent = new https.Agent({
  pfx: pfxBytes,
  passphrase: senha,
  rejectUnauthorized: false,
});

const req = https.request({
  hostname: url.hostname,
  port: 443,
  path: url.pathname,
  method: "POST",
  agent,
  headers: {
    "Content-Type": "application/soap+xml; charset=utf-8",
    SOAPAction: "http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4/nfeStatusServicoNF",
    "Content-Length": Buffer.byteLength(soapBody),
  },
}, (res) => {
  let data = "";
  res.on("data", (chunk) => data += chunk);
  res.on("end", () => {
    console.log(`\nStatus HTTP: ${res.statusCode}`);
    console.log(`Headers: ${JSON.stringify(Object.fromEntries(Object.entries(res.headers).filter(([k]) => k.includes('server') || k.includes('date'))), null, 2)}`);
    
    if (res.statusCode >= 400) {
      console.log(`\nErro HTTP ${res.statusCode}:`);
      console.log(data.substring(0, 1000));
    } else {
      // Extrair cStat e xMotivo
      const cStat = data.match(/<cStat>(\d+)<\/cStat>/)?.[1] || "N/A";
      const xMotivo = data.match(/<xMotivo>([^<]+)<\/xMotivo>/)?.[1] || "N/A";
      const cUF = data.match(/<cUF>(\d+)<\/cUF>/)?.[1] || "N/A";
      console.log(`\ncStat: ${cStat}`);
      console.log(`xMotivo: ${xMotivo}`);
      console.log(`cUF: ${cUF}`);
    }
  });
});

req.on("error", (e) => {
  console.error(`\nErro de conexao: ${e.message}`);
  console.error(`Code: ${e.code}`);
  if (e.code === "ECONNREFUSED") console.error("Servidor recusou conexao");
  if (e.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") console.error("Falha na verificacao do certificado do servidor");
  if (e.code === "ERR_TLS_CERT_ALTNAME_INVALID") console.error("Hostname nao bate com certificado do servidor");
});

req.write(soapBody);
req.end();

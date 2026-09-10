import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const findings = [];
const blockedPath = /\.(?:zip|apk|aab|dll|exe|pdb|pfx|p12|pem|key|jks|keystore|csv|xlsx|xls|pdf)$|(?:^|\/)(?:scratch|autocount_import|verification|artifacts|NoUse|publish)\/|(?:backup.*\.cs|test\d+\.txt)$/i;
const forbiddenContent = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/,
  /\$2[aby]\$\d{2}\$[.\/A-Za-z0-9]{53}/,
  /(?:[a-z0-9-]+\.)*(?:mewahserver\.com|mewahautoworks\.com)/i,
];
for (const file of files) {
  if (blockedPath.test(file) || /(?:^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.env.example')) {
    findings.push(`${file}: prohibited publication artifact`);
    continue;
  }
  const data = readFileSync(file);
  if (data.includes(0)) continue;
  const text = data.toString('utf8');
  if (forbiddenContent.some(pattern => pattern.test(text))) findings.push(`${file}: sensitive content pattern`);
  for (const [index, line] of text.split('\n').entries()) {
    const literal = line.match(/(?:^|\s)(?:(?:localPassword|localSaPassword|password|passwd|pwd)|\$pass)\s*=\s*["']([^"']+)["']/i);
    if (literal && !/^(?:DEMO-ONLY-NOT-A-SECRET|\*)$/.test(literal[1]) && !/[{}$]/.test(literal[1])) {
      findings.push(`${file}:${index + 1}: literal credential assignment`);
    }
    const connection = line.match(/(?:Password|Pwd)=([^;"'\s]+)/i);
    if (connection && !/[{}$]/.test(connection[1])) findings.push(`${file}:${index + 1}: literal connection credential`);
  }
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else console.log(`Publication policy passed for ${files.length} tracked files. Run Gitleaks separately for full secret detection.`);

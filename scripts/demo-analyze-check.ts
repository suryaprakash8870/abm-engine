import 'dotenv/config';
import { analyzeBusinessToAnswers } from '../lib/engines/icp-engine/analyze';
import { llmProvider } from '../lib/clients/llm';
import { firecrawlMode } from '../lib/clients/firecrawl';

async function run(label: string, input: string) {
  const t0 = Date.now();
  const a = await analyzeBusinessToAnswers(input);
  const ms = Date.now() - t0;
  console.log(`\n=== ${label}  (input: "${input}", ${ms}ms) ===`);
  console.log('product     :', a.product);
  console.log('problem     :', a.problem);
  console.log('industry    :', a.industry);
  console.log('best_cust.  :', a.best_customers);
  console.log('buyer_role  :', a.buyer_role);
}

async function main() {
  console.log('LLM provider:', llmProvider(), '| Firecrawl:', firecrawlMode());
  // Distinctive site (crawl cached from the prior run) — measures LLM time on the
  // trimmed page text. Answers should still be payments/fintech, just faster.
  await run('URL → crawl (trimmed)', 'stripe.com');
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERR', e); process.exit(1); });

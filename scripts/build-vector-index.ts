/**
 * Build Vector Index — Syncs supply chain graph nodes to pgvector embeddings.
 *
 * This script reads all nodes from the in-memory graph store, generates
 * embeddings for their searchable text, and upserts them into the
 * graph_embeddings table for semantic search.
 *
 * Run: npx tsx scripts/build-vector-index.ts [--force] [--batch-size 20] [--concurrency 3]
 */

import { buildVectorIndex } from '@/lib/engine/vector-index-builder';
import { getEmbeddingCount } from '@/lib/engine/vector-store';

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  const batchSizeArg = args.indexOf('--batch-size');
  const batchSize = batchSizeArg >= 0 ? parseInt(args[batchSizeArg + 1], 10) : 20;

  const concurrencyArg = args.indexOf('--concurrency');
  const concurrency = concurrencyArg >= 0 ? parseInt(args[concurrencyArg + 1], 10) : 3;

  console.log('=== Vector Index Builder ===');
  console.log(`Options: force=${force}, batchSize=${batchSize}, concurrency=${concurrency}`);

  const beforeCount = await getEmbeddingCount();
  console.log(`Existing embeddings: ${beforeCount}`);

  const result = await buildVectorIndex({ batchSize, concurrency, force });

  const afterCount = await getEmbeddingCount();
  console.log(`\n=== Result ===`);
  console.log(`Indexed: ${result.indexed}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Errors:  ${result.errors}`);
  console.log(`Total embeddings now: ${afterCount}`);

  if (result.errors > 0) {
    console.warn(`\n⚠ ${result.errors} nodes failed to index. Check logs above for details.`);
    process.exit(1);
  }

  console.log('\n✓ Vector index build complete.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

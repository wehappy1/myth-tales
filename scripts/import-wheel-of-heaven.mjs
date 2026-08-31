/**
 * 从 Wheel of Heaven Myth Index (CC0) 导入神话母题数据
 * 用法: node scripts/import-wheel-of-heaven.mjs
 */

const API_URL = 'https://api.wheelofheaven.world/v1/datasets/myth-index.json';

const res = await fetch(API_URL);
if (!res.ok) {
  console.error('Failed to fetch:', res.status);
  process.exit(1);
}

const data = await res.json();
const stories = data.rows.map((row) => ({
  id: row.id,
  title: `${row.tradition} · ${row.motif_family}`,
  summary: row.summary,
  content: row.summary,
  category: 'motif',
  tradition: mapTradition(row.tradition),
  region: row.tradition,
  source_id: 'wheel-of-heaven',
  source_text: row.source_text,
  reference: row.reference,
  tags: [row.motif_family, ...(row.thompson_motifs ?? [])].join(','),
  language: 'en',
  license: 'CC0-1.0',
  external_url: row.woh_library || row.woh_wiki || undefined,
}));

console.log(JSON.stringify(stories, null, 2));
console.error(`Imported ${stories.length} records from Wheel of Heaven`);

function mapTradition(tradition) {
  const t = tradition.toLowerCase();
  if (t.includes('chinese') || t.includes('china')) return 'chinese';
  if (t.includes('greek')) return 'greek';
  if (t.includes('norse') || t.includes('scandinav')) return 'norse';
  if (t.includes('egypt')) return 'egyptian';
  if (t.includes('india') || t.includes('hindu')) return 'indian';
  if (t.includes('japan')) return 'japanese';
  if (
    t.includes('sumerian') ||
    t.includes('babylonian') ||
    t.includes('akkadian') ||
    t.includes('mesopotam')
  ) {
    return 'mesopotamian';
  }
  return 'cross';
}

// Uploads the menu photos in supabase/seed-images/ to the public "menu" storage bucket.
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/upload-menu-images.mjs
// Products reference them as image_path = 'menu/<file>.webp' (see supabase/seed.sql).
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key, { auth: { persistSession: false } });
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../supabase/seed-images');

for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.webp'))) {
  const { error } = await supabase.storage.from('menu').upload(file, fs.readFileSync(path.join(dir, file)), {
    contentType: 'image/webp', upsert: true, cacheControl: '604800',
  });
  console.log(error ? `✗ ${file}: ${error.message}` : `✓ ${file}`);
}

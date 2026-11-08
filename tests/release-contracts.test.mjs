import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');

function walk(relativeDirectory) {
  const absolute = path.join(root, relativeDirectory);
  return readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDirectory, entry.name);
    return entry.isDirectory() ? walk(relative) : [relative];
  });
}

test('browser configuration contains only the rebuild project public Supabase credentials', () => {
  const client = read('src/lib/supabase.ts');
  const example = read('.env.example');
  assert.match(client, /VITE_SUPABASE_URL/);
  assert.match(client, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(client, /SERVICE_ROLE|PAYSTACK_SECRET|CLIENT_SECRET|PRIVATE_KEY/i);
  assert.match(example, /chcyncvieekjousgzlrg/);
  const variables = example.split(/\r?\n/).map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1]).filter(Boolean).sort();
  assert.deepEqual(variables, ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL']);
});

test('server credentials never appear in browser source', () => {
  const browserFiles = [...walk('src'), ...walk('public')];
  for (const file of browserFiles) {
    const content = read(file);
    assert.doesNotMatch(content, /SUPABASE_SERVICE_ROLE_KEY|PAYSTACK_SECRET_KEY|GOOGLE_CLIENT_SECRET|APPLE_PRIVATE_KEY|VITE_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE)/i, file);
    assert.doesNotMatch(content, /nwmbbhuepbycbkjirqeg/i, file);
  }
});

test('signup edge function matches the hardened deployed guard contract', () => {
  const signup = read('supabase/functions/create-panda-account/index.ts');
  assert.match(signup, /APP_ALLOWED_ORIGINS/);
  assert.doesNotMatch(signup, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/);
  assert.match(signup, /contentLength\s*>\s*16_384/);
  assert.match(signup, /password\.length\s*<\s*8\s*\|\|\s*password\.length\s*>\s*128/);
  assert.match(signup, /check_signup_rate_limit/);
  assert.match(signup, /safeMetadata/);
  assert.match(signup, /email_confirm:\s*true/);
  assert.match(signup, /phone_confirm:\s*true/);
  assert.match(signup, /SUPABASE_SERVICE_ROLE_KEY/);
});

test('coin purchase initialization authenticates the caller and refuses unpriced packages', () => {
  const initializer = read('supabase/functions/initialize-coin-purchase/index.ts');
  assert.match(initializer, /PAYSTACK_SECRET_KEY/);
  assert.match(initializer, /auth\.getUser\(\)/);
  assert.match(initializer, /price\s*<=\s*0/);
  assert.match(initializer, /amountMinor/);
  assert.match(initializer, /currency:\s*"NGN"/);
  assert.match(initializer, /status:\s*"pending"/);
});

test('Paystack webhook verifies the raw-body HMAC before crediting coins', () => {
  const webhook = read('supabase/functions/paystack-webhook/index.ts');
  assert.match(webhook, /HMAC.*SHA-512/);
  assert.match(webhook, /x-paystack-signature/);
  assert.match(webhook, /constantTimeEqual/);
  assert.match(webhook, /charge\.success/);
  assert.match(webhook, /currency\s*!==\s*"NGN"/);
  const signatureCheck = webhook.indexOf('verifyPaystackSignature(rawBody');
  const creditCall = webhook.indexOf('rpc("complete_coin_purchase_secure"');
  assert.ok(signatureCheck >= 0 && creditCall > signatureCheck, 'wallet credit must follow signature verification');
});

test('anonymous confession author IDs stay behind the privacy-safe feed view', () => {
  const migration = read('supabase/migrations/20261107082130_revoke_legacy_confession_author_exposure.sql');
  const app = read('src/App.tsx');
  assert.match(migration, /REVOKE EXECUTE ON FUNCTION public\.get_public_confessions\(integer\) FROM authenticated/i);
  assert.match(app, /feed_posts_public/);
  assert.doesNotMatch(app, /get_public_confessions/);
});

test('notification inbox subscriptions remain user-scoped', () => {
  const app = read('src/App.tsx');
  assert.match(app, /from\(['"]notifications['"]\)/);
  assert.match(app, /filter:\s*['"]user_id=eq\.['"]\s*\+\s*userId/);
  assert.match(app, /\.eq\(['"]user_id['"],\s*session\.user\.id\)/);
});

test('unverified rewarded-ad completion cannot directly claim BC in the UI', () => {
  const activity = read('src/components/DailyActivitiesFeature.tsx');
  const migration = read('supabase/migrations/20261011224258_require_verified_ad_reward_completion.sql');
  assert.match(activity, /is_ad_only/);
  assert.match(activity, /Setup required/);
  assert.doesNotMatch(activity, /claim_economy_reward/);
  assert.match(migration, /Ad rewards are only credited after trusted ad-completion verification/);
});

-- HOW A CREDENTIAL GOT HERE, AS A COLUMN.
--
-- `connections` has always recorded WHAT platform a credential is for and never HOW it was
-- obtained, because until now the provider implied it: everything was OAuth except WooCommerce.
-- Meta breaks that implication, and not as an edge case. The same Meta Ads account can be
-- connected by sending an owner through the OAuth dance, or by pasting a System User token the
-- customer minted in its own Business Manager. Same provider, same `external_account_id`, two
-- lanes -- and the things that decide whether a connection is healthy differ between them:
--
--   * whether a refresh token exists (only the OAuth lane can ever self-heal),
--   * whether `expires_at is null` means PERMANENT or means NOT REPORTED,
--   * what to tell the customer when it breaks -- "reconnect the account" is useless advice for a
--     pasted token, because there is no account screen to reconnect from.
--
-- WHY A COLUMN RATHER THAN READING THE SEALED BLOB. The credential already carries a `kind`
-- discriminant, so the information exists -- inside AES-256-GCM ciphertext the database cannot
-- open and, by design, the KEK for which lives in Cloudflare. Health checks, the connections list
-- and the connect surface would each need a decryption to answer "is this one fine?". That is the
-- cost this column removes.
--
-- The price is a second copy of one fact, and a second copy that drifts silently is a defect
-- generator. `openCredential` in packages/connections now refuses when the column and the blob
-- disagree rather than preferring either -- if they differ, every cheap read has been answering
-- from the wrong one, and which is right is not knowable from here.

create type app.credential_lane as enum (
  -- An authorisation server issued it. Scopes, a clock, and possibly a refresh token.
  'oauth',
  -- The customer issued itself a key AND a secret in its own admin. No issuer, no clock.
  'key_secret',
  -- The customer issued itself ONE opaque token. No issuer, and a clock only when the platform
  -- gave us a date -- Meta will mint a System User token dated or permanent from the same screen.
  -- Never refreshable: there is no issuer to ask.
  'bearer'
);

alter table public.connections add column credential_lane app.credential_lane;

-- BACKFILL BEFORE THE CONSTRAINT, and the mapping is exhaustive rather than a default.
--
-- Every row that exists predates the bearer lane, so there are exactly two cases and both are
-- determined by the provider -- which is precisely the implication this migration is retiring. It
-- is sound HERE and only here, for rows written while it still held.
update public.connections
   set credential_lane = case
         when provider = 'woocommerce' then 'key_secret'::app.credential_lane
         else 'oauth'::app.credential_lane
       end
 where credential_lane is null;

alter table public.connections alter column credential_lane set not null;

-- NO DEFAULT, DELIBERATELY. A default of 'oauth' would let an insert that forgot the column
-- succeed and be wrong -- a bearer connection silently filed as a grant, which `openCredential`
-- would then refuse to open, at pull time, hours later. Requiring the value makes the omission a
-- write error at the moment of the write, with a stack pointing at the caller.

comment on column public.connections.credential_lane is
  'How this credential was obtained: oauth | key_secret | bearer. Must equal the `kind` inside the '
  'sealed blob; packages/connections refuses to open one where they disagree. Readable without the '
  'KEK, which is the reason it is a column rather than a field in the ciphertext.';

-- WHAT IS NOT HERE: a check constraint tying each provider to the lanes it offers.
--
-- `PROVIDER_LANES` in packages/connections is that table, and duplicating it in a constraint would
-- put the same mapping in two languages with nothing relating them -- the exact arrangement that
-- produced the drift `scripts/check-providers.mjs` now exists to catch, where four members of
-- `app.connection_provider` ('impact', 'awin', 'cj', 'partnerstack') have no TypeScript name at
-- all. One source, guarded, beats two that agree today. Filed rather than folded in.

# Devpost submission checklist — "Hack the Zero Stack" (deadline Jun 30, 2026)

**Track: 2 — Monetizable B2B app** (fair-launch infrastructure for clinics, ticketing,
retail drops; providers pay per release / SaaS seat). Also competes for **Best Technical
Implementation**.

> **Live:** https://singleton-six.vercel.app
>
> Two allocation modes, both provable on Aurora DSQL: **Mode A** (first-come, sharded atomic
> claims, live no-oversell dashboard) and **Mode B** (windowed lottery with a commit-reveal
> draw — the verify page re-runs the entire draw in the visitor's browser and shows MATCH).
> It is a **multi-tenant marketplace**: operators self-register and manage only their own
> releases (server-enforced ownership), browsable through a category filter rail over a
> 54-event, six-per-category showcase.
> Video beat: enter the window → draw → click "Re-run the draw" → MATCH banner.

## Required items

- [ ] **Text description** — must name the AWS Database: **Amazon Aurora DSQL** (single- or
      multi-region peered). Lead with the insight: no-oversell as one ordinary ACID
      transaction because DSQL is strongly consistent + active-active + serverless.
- [ ] **Demo video < 3 min** (YouTube, public). Script beats:
      1. (0:00–0:25) Problem: oversold appointments / crashed ticket drops; who it's for.
      2. (0:25–0:55) The marketplace: category filter rail; pick a release (4K poster page).
      3. (0:55–1:30) Live flow: claim → receipt "#n of N" + QR → public ledger (full receipt id).
      4. (1:30–2:10) The proof: admin "Run burst" → **oversells: 0**, ranks 1..N, OCC retries
         on screen; mention `npm run stress` **10,000 vs 200, 0 oversells**.
      5. (2:10–2:35) Multi-tenant B2B: an operator self-registers, creates a release, can delete
         only their own; lottery "Re-run the draw" → MATCH.
      6. (2:35–3:00) Why Aurora DSQL (sharded counter + OCC, one ACID transaction) + monetization close.
- [x] **Published Vercel project link** — https://singleton-six.vercel.app (public, verified).
- [ ] **Vercel Team ID** — Team settings → General → copy ID (paste into the form).
- [x] **Architecture diagram** — `docs/architecture.png` (source `docs/architecture.svg`); updated
      for multi-tenancy + the marketplace.
- [ ] **Screenshot: storage configuration proving AWS Database usage** — Vercel project
      → Settings → Environment Variables showing `DSQL_CLUSTER_ENDPOINT` / `AWS_REGION`
      (values hidden is fine), plus AWS console cluster page as backup.

## Bonus points

- [ ] **Published content piece** with the required disclosure ("created for the purposes of
      entering this hackathon") + **#H0Hackathon** when shared. Draft title: *"How I built
      provably-fair, no-oversell allocation on Aurora DSQL (OCC retries, sharded counters,
      and a 10,000-claim stress test)"* — publish on builder.aws.com or dev.to.

## v0 evidence (the "Zero Stack" story)

- [x] v0 chat links (public, "anyone with the link"):
      - Receipt card: https://v0.app/chat/fair-allocation-receipt-r02sWMCWGhN
      - Landing hero + principles: https://v0.app/chat/singleton-landing-page-pqMkmiIqurO
- [x] v0's own light/dark verification renders: `docs/v0/receipt-light.png`, `docs/v0/receipt-dark.png`
      (plus take one screenshot of the v0 chat UI for the video).
- [x] Imported components live in `src/components/v0/` (provenance headers note the chat URL and
      the minimal adaptations: `brand`→`primary` token, `render`→`asChild`, anchor→`next/link`).
      Wired into `app/page.tsx` (Hero, Principles) and `app/receipt/[allocationId]/page.tsx`
      (AllocationReceipt with live rank data).
- [ ] One line in the description: "Landing hero/principles and the allocation receipt card were
      scaffolded with v0 (v0 Max) and imported into the hand-built data layer."

## Testing instructions (paste into the Devpost form)

> The rules require free, unrestricted judge access and explicitly allow credentials in
> testing instructions. The admin magic link signs judges in with one click
> (`/admin#token=…` stores the token and scrubs it from the URL). The token rides in the
> URL fragment, which browsers never send to the server, so it stays out of access logs.

Template — fill the deployed URL + the production ADMIN_TOKEN before submitting:

```
Everything is live and free to test — no account needed.

PARTICIPANT FLOW (no credentials):
1. Open <VERCEL_URL> → pick any release (poster cards).
2. FCFS release: enter any email → "Claim a slot" → receipt with rank + QR →
   "Verify on the public ledger".
3. Lottery release: "Enter the draw" → watch the entrant count + fairness
   commitment; after the draw, "Re-run the draw in your browser" on the verify
   page recomputes every winner client-side (MATCH banner).

PLATFORM ADMIN FLOW (one-click sign-in):
<VERCEL_URL>/admin#token=<ADMIN_TOKEN>
• Create a release (either mode, optional poster image URL).
• Open a release monitor → "Run burst" fires hundreds of concurrent claims and
  shows the live invariant audit (oversells: 0, latency, OCC retries).
• Lottery releases: "Run draw" once the window closes.
• Platform admin can delete any release.

OPERATOR (TENANT) FLOW (self-serve, no shared token):
At <VERCEL_URL>/admin choose "Operator" → "Create operator account" → you get a
secret key and your own dashboard. Releases you create are owned by you: you can
delete only your own; another operator's releases are off-limits (server-enforced).

The cluster (Aurora DSQL, us-east-1) and this deployment stay up through the
entire judging period.
```

## Pre-submit verification

- [ ] `npm run stress -- --attempts 10000 --capacity 200 --shardCount 32` → exit 0, oversells 0.
- [ ] `npm run test` + `npm run test:e2e` green against the live cluster.
- [x] Deployed flow smoke-tested: claim → receipt → verify on https://singleton-six.vercel.app.
- [x] `/api/health` returns ok on production.
- [ ] Reset showcase before recording: `npx tsx scripts/cleanup-test-data.ts && npx tsx scripts/seed-showcase.ts` (54 events, six per category).

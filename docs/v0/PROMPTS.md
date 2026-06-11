# v0 integration — prompts + workflow

The hackathon is branded around **Vercel v0** ("Use Vercel's v0 to scaffold a production-ready
Next.js frontend"). This project's frontend was hand-built on the same stack v0 emits
(Next.js + Tailwind v4 + shadcn/ui), so v0 generations import cleanly. We use v0 for two real
surfaces and keep the evidence for the submission.

## Your 10 minutes (browser)

1. Sign in at **v0.app** (the hackathon requires a v0 account anyway — also fill the
   AWS/v0 credits request form while you're there).
2. Start a new chat, paste **Prompt 1** below. Iterate until you like it (1–2 follow-ups max;
   e.g. "more whitespace", "smaller badge").
3. In the generated block's menu choose **"Open in CLI"** (or copy the block URL,
   `https://v0.dev/chat/b/<BLOCK_ID>`). Send me the URL or the full
   `npx shadcn@latest add "<url>"` command — I'll import it into `src/components/v0/` and
   wire it up without breaking the data plumbing.
4. Repeat with **Prompt 2** (optional but recommended — two v0 surfaces reads better than one).
5. **Capture evidence** (for the Devpost submission):
   - screenshot of the v0 chat showing the prompt + generated UI,
   - the public v0 chat/block link,
   - note the line for the submission text: "Landing hero and receipt card scaffolded with v0
     and imported via the shadcn CLI."

> Keep the chat link handy — judges seeing a real v0 generation that matches the deployed
> site is exactly the "Zero Stack" story.

---

## Prompt 1 — Receipt card (the emotional centerpiece)

```
Design a single React component: a "fair-allocation receipt" card for an app called
Singleton, built with shadcn/ui (Card, Badge, Button, Separator) + Tailwind + lucide-react.

Purpose: after a user claims one of a fixed batch of appointment slots, this card proves
their place in line.

Props (TypeScript):
interface ReceiptProps {
  releaseTitle: string;   // e.g. "Spring vaccination slots"
  rank: number;           // e.g. 12
  capacity: number;       // e.g. 200
  claimedAt: string;      // ISO timestamp, display as UTC
  allocationId: string;   // uuid, show truncated + monospace
  verifyHref: string;     // link to the public ledger
}

Design requirements:
- Calm, trustworthy, generous whitespace. Neutral palette with ONE restrained indigo accent
  (works with shadcn css-variable theming: bg-primary, text-primary, etc. — do NOT hardcode hex).
- The hero element is the position: "#12" very large with "of 200" muted beside it, label
  "Your position". Use tabular-nums.
- A CheckCircle icon + headline "You secured a slot", subline = releaseTitle.
- Details list: "Secured at" (UTC timestamp) and "Receipt id" (truncated uuid, monospace).
- One sentence of reassurance: "Your position is derived from an immutable public ledger —
  anyone can re-check it independently." Then a secondary button "Verify on the public ledger"
  linking to verifyHref.
- Accessible (semantic headings, aria where needed), light/dark via shadcn variables,
  no countdown-pressure or scarcity dark patterns, sentence case.
- Single file, no data fetching — pure presentational component taking the props above.
```

## Prompt 2 — Landing hero + principles section

```
Design a landing hero + "principles" section for Singleton, a fair-allocation system, using
shadcn/ui + Tailwind + lucide-react. Pure presentational React, no data fetching.

Content:
- Small secondary badge: "Amazon Aurora DSQL · strongly consistent".
- H1: "Fair, no-oversell allocation of scarce slots."
- Subtitle: "Singleton releases a fixed batch of slots to a crowd and guarantees every claim
  is correct, first-come fair, and independently verifiable — one ordinary ACID transaction,
  no blockchain."
- Primary button "Create a release" (href="/admin") with an arrow icon.
- Below: three equal cards — Correct (ShieldCheck icon): "A fixed batch is split across many
  counter shards; a single ACID transaction with retry means it can never oversell." /
  Fair (ListChecks): "First-come ordering, one slot per person, no line-jumping — enforced by
  the database, not by hope." / Verifiable (ScrollText): "Every claimant gets a receipt whose
  position can be re-checked against an immutable public ledger."

Design requirements: calm and editorial, generous whitespace, neutral palette + one indigo
accent via shadcn css variables (no hardcoded hex), text-balance on the H1, accessible,
light/dark ready, sentence case, no marketing hype or urgency patterns.
```

---

## What I do after you paste the URL(s)

1. `npx shadcn@latest add "<v0 url>"` (lands in `src/components/` per components.json).
2. Move/rename under `src/components/v0/`, reconnect real data (receipt page props, landing
   content), keep our routing + polling untouched.
3. Re-run typecheck/lint/build + visual smoke.
4. Add the v0 chat link(s) to `docs/SUBMISSION.md`.

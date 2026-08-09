# Mobile performance budget — design

**Date:** 9 August 2026
**Status:** Approved, ready to plan.

## Why now

The roadmap targets a Lighthouse performance score of **≥95 on mobile**. That
number has never been measured. The seed carries five dishes; the flagship grid
preset loads a photograph per dish; a real menu is closer to ninety. So the one
layout the owner chose to lead with is the one nobody has tested at the size a
real client will use it.

This is the cheapest de-risking available before launch. It needs no money, no
accounts and no decisions from the owner, and it answers open question 4 in
`docs/deployment-plan.md` — measure before launch, or discover it in front of a
paying client.

## What "realistic" has to mean, or the exercise is worthless

The existing seeded photos are flat gradients: **3,132 bytes each, and every
one identical**. A photograph of a plate, through this application's own
`processImage()`, is one to two orders of magnitude heavier. Measuring the grid
preset against 3 KB gradients would return a score near 100 that means nothing
at all.

Three properties the fixture must have, each for a specific reason:

1. **Photographic weight.** Detail that WebP cannot cheaply throw away.
2. **Ninety distinct files.** Identical bytes under different keys would let
   HTTP caching flatter the result in a way a real menu never would.
3. **A photo on every dish.** `ItemCard` degrades honestly when a dish has no
   photo, and most restaurants photograph only part of their menu — but the
   fully-photographed grid is the worst honest case, and it is the case the
   owner's flagship preset invites.

The fixture generator **verifies its own output** and fails loudly if the mean
stored file falls outside **100–400 KB**, the band a phone photograph lands in
after `processImage()` resizes it to 1600 px and re-encodes it to WebP at
quality 82. `scripts/make-image-fixtures.mjs`
already works this way, throwing when its EXIF fixture would prove nothing. A
fixture that silently degrades turns a green measurement into a lie, which is
worse than no measurement.

## The fixture

A script creating a dedicated tenant, `perf-lab`:

- Eight sections, ninety dishes, shaped like a real Lebanese menu.
- Paired English and Arabic names throughout, descriptions on most dishes, two
  sizes on some, a handful sold out.
- The grid preset, and a photo on every dish.
- Rows written through the same repository layer the admin uses, so they are
  indistinguishable from dishes typed into quick-add.

**A separate tenant, not `alpha-grill`.** The seeded demo tenants are read-only
for the whole browser suite — `menu.spec`, `tenant-resolution.spec` and
`theming.spec` assert against them in parallel. Adding ninety dishes to
`alpha-grill` would break them.

**A script rather than the browser.** The menu must be rebuilt identically after
every fix, and typing it takes minutes that cannot be reproduced byte for byte.
Quick-add's own cost was measured during Phase 4c — 149 ms median from Enter to
the row appearing, flat as the list grew — so re-proving it is not what this
task is for.

The script is re-runnable and resets what it owns, so a measurement can be
repeated from a known state.

## The measurement

- **Against a production build** (`next build` and `next start`), never the dev
  server. Development-mode numbers are meaningless.
- **On port 3200**, which cannot collide with a dev server on 3000 or the
  browser suite on 3100.
- **Lighthouse's default mobile preset** — mid-tier phone, slow 4G. The
  throttle is not loosened to flatter the result, because "≥95 mobile" in the
  roadmap means the default preset and any other number is incomparable.
- **Cold and warm, reported separately.** The Next image optimizer caches after
  first use. Cold is what the first customer of the day actually receives.
- **Median of three runs.** A single Lighthouse run is noise, not a
  measurement.
- **Chrome specifically.** `*.localhost` resolves in Chrome only; Lighthouse
  drives a real Chrome, so this works where Node and Playwright's `request`
  fixture would not.

Output is written to a file so before and after are comparable: the score, and
every failing audit with its numbers.

## Hypotheses, recorded before measuring

Written down so the measurement can contradict them rather than confirm them.
Fixes follow the audit, not this list.

1. **The largest image on screen is lazy-loaded.** `ItemCard` never sets
   `priority`, and `next/image` defaults to `loading="lazy"`. On a two-column
   mobile grid several photos sit above the fold, so the LCP element is one of
   them. Lighthouse flags this directly.
2. **Ninety blur placeholders inlined into the document.** Roughly 300 bytes of
   base64 each, which gzip barely touches, on the critical path.
3. **The structured-data block carries all ninety dishes**, inline, in the same
   document.
4. **Ninety cold image-optimizer requests**, each a `sharp` resize.

The list preset is spot-measured too. It is the default and the honest choice
for a photo-less menu, and it tells us whether grid is an outlier or the page is
heavy in general.

## Boundaries

Two changes are out of scope without an explicit product decision from the
owner, because both change what a customer sees rather than how fast they see
it:

- Removing or reducing photography in the grid preset.
- Changing what the menu says.

If the remaining gap to 95 runs through either, the measurement is reported with
its numbers and the decision goes to the owner.

Also out of scope: a CI budget gate. The scripts stay in the repository and are
documented, but are **not** wired into `npm run verify` — they need a production
build and a browser, which is too slow for the everyday loop. Enforcement
belongs to Phase 6, alongside Sentry and the CSP.

## Done

- A measured score for the grid preset at ninety dishes on mobile, cold and
  warm, median of three.
- If it is below 95: fix, re-measure, repeat, until it is not — or until the
  remaining gap needs the owner's decision.
- `npm run verify` green; `E2E_PORT=3100 npm run test:e2e` green twice
  consecutively; merged to `main` and pushed; branch deleted.
- `docs/STATUS.md` updated to state the measured number, replacing the known
  gap that says it has never been tested.

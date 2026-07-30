---
name: TBNai logo handling
description: Use the user's logo PNG exactly as uploaded — no processing
---
**Rule:** use the user's uploaded TBNai logo PNG byte-for-byte as `artifacts/archive-search/public/logo.png`. No background removal, no flattening, no trimming, no recoloring.

**Why:** the user explicitly rejected every processed version (bg removal left ragged alpha edges; flattening on white was rejected as "adding a background"). They consider their file clean and final.

**How to apply:** on any new logo upload, `cp` it straight into place. Sign-in logo width matches the Clerk card (440px). Light theme bg is pure white, so the file's soft haze blends fine.

---
name: TBNai logo handling
description: Why the logo asset must stay flattened on white, not transparent
---
The TBNai logo artwork (user-supplied AI-generated PNG in attached_assets) has a soft white glow/haze baked in around the book mark.

**Rule:** do not run background removal on it — it leaves ragged alpha edges and dark matte smudges the user rejects. Serve the original flattened onto white (`magick in.png -background white -flatten out.png`).

**Why:** the app's light theme background is pure white (TBN blue token palette), so a white-flattened logo blends seamlessly; transparency buys nothing and looks worse.

**How to apply:** any time a new logo file is uploaded, flatten on white → `artifacts/archive-search/public/logo.png`. Sign-in logo width is matched to the Clerk card (440px).

# Facet identity and default theme

The approved Facet mark is a folded triangular play/prism with a slim teal left facet, pale-blue upper facet, periwinkle lower facet and open center. `src/assets/brand/facet.svg` is the flat, scalable reconstruction of the approved raster concept. Do not add a letter, glow, gradient, outline or shadow to the mark.

- Teal: `#59A99E` — mark left facet, primary playback fill, active lyric marker.
- Pale blue: `#ADC8DE` — mark upper facet, selected text, filled secondary actions and focus outlines.
- Periwinkle: `#898FBD` — mark lower facet and supporting brand accents.
- Charcoal: `#131619` canvas; `#202327` icon tile. Light text: `#EDF2F6`; active lyrics stay white.

The stored default theme identifier remains `prism`; Settings labels it **Facet**. Existing default selections receive Facet without a settings migration. Explicit Ocean, Orchid and Evergreen selections remain selected. Instrument Sans and its bundled OFL remain unchanged. Cover-derived artwork wash remains an optional independent setting.

## Production assets

The bare mark is used in the app header and browser favicon. `src-tauri/icons/icon.svg` is the desktop square master, with an inset rounded charcoal tile and a centered mark. Desktop PNG, ICNS, ICO and Windows logo variants are generated with the existing Tauri CLI:

```sh
npm run tauri -- icon src-tauri/icons/icon.svg --output /tmp/prism-icons
```

Copy only the desktop outputs into `src-tauri/icons/`. Mobile assets are outside this desktop change. Keep these vector sources and regenerate raster assets together. Inspect the 32px icon and 30–40px bare mark as well as the large master. The originating concept is user-provided generated artwork; these vectors add no external icon/font dependency. No font license key is required.

## Acceptance

Automated checks cover default/alternative theme selection, actual vector asset loading, palette roles, active lyric marker, readable full-height lyrics and non-overlapping Home cards with a playback sidebar. Check the real native candidate for header/Dock appearance, focus visibility, selected rows and lyrics with both cover wash settings. Do not equate browser fixtures with native visual acceptance.

Native icon replacement is part of installing a candidate, not a source edit. Never overwrite an installed app or change signing/notarization configuration merely to test branding. This change builds an app candidate; the existing DMG background has not been redesigned and must be reviewed before a future installer/release.

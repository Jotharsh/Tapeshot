# Tapeshot

Measure anything from a photo. Put a sheet of A4/Letter paper or a bank card next to the thing, take the picture, mark the sheet's four corners, then tap the two ends of what you want to measure.

Works offline, installs to the home screen, no account, no server. Photos never leave your device.

## How it works
The four corners of the reference define a planar homography (DLT with point normalisation) from photo pixels to millimetres on the reference surface. Which side of the sheet is long is resolved from the apparent shape plus a camera-based aspect estimate, with a manual "swap sides" override. Each reading shows a Monte-Carlo ± from corner-placement error.

## Limits (honest)
- Only things lying flat on the same surface as the reference are measured correctly. Height and tall objects are not.
- Straighter-on photos are more accurate; steep angles, small references and wide-angle distortion add error.
- Tested against synthetic photos with known answers and in desktop Chrome; not yet tested on many real phones or lenses.

## Run
No build step. Serve the folder with any static server, e.g. `npx serve .`.

## Test
`node --test test/` runs the geometry and unit tests. Browser end-to-end checks use puppeteer-core against a local server.

## Icons
`scripts/make-icons.mjs` (needs `PUPPETEER_CORE` pointing to puppeteer-core) regenerates the PNG icons from `icons/source*.svg`.

Set in Geist (SIL OFL). MIT licensed.

# Better Sidebar Web Agent Connector — store images

Upload the five numbered PNGs. Four screenshots are 1280×800; the small promotional tile is 440×280. All are flattened RGB PNGs without alpha. The ZIP contains only these five upload files.

Suggested order: connection, controlled page, action approval, risk notice. Screenshots are composed over one image_gen decorative background, with deterministic text and layout. Originals are preserved in the parent directory. No project dependencies were added.

## Source coverage

- 01: genuine connected popup, cropped from image.png. It shows no controlled tabs; no tab entry has been fabricated.
- 02: controlled-tab-en.png, the previously AI-localized image copy 3.png. Shows Chrome debugging notice and side panel. As previously disclosed, small text and icon details differ from the raw original.
- 03: genuine approval dialog cropped from image copy.png.
- 04: genuine accepted risk-notice window from image copy 2.png. No Connector setup card is present in this source.
- 05: real packaged connector icon with deterministic English text.

This set supplies the store upload dimensions, but does not recreate the original proposed shots of a popup with a controlled tab or a risk notice with a Connector card. These can be replaced later if those exact compositions are needed. No approval or store acceptance is implied.

## Rebuild and checks

Run build-store-assets.cjs in the parent directory using Node and an available sharp package. It generates the five images, validation.json, and store-contact-sheet.png in the parent directory. validation.json records exact dimensions and absence of alpha. Background prompt is saved in PROMPT.txt; localization prompt is in the parent directory.

Official requirements checked: https://developer.chrome.com/docs/webstore/cws-dashboard-listing and https://developer.chrome.com/docs/webstore/images

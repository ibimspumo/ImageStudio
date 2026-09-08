# ImageStudio — Studio A

Approved reference: `design/mockups/index.html`, direction A.

## Scene

A creator spends long sessions reviewing bright thumbnails and studio images on a desktop display; dark neutral surroundings keep attention on the media and reduce competing visual color.

## Visual system

- Background #111213; sidebar/panels #18191a; inputs #242527; hover #303234.
- Primary text #f4f4f2; supporting text #a9acac.
- Lime #d9f574 for primary actions and selected states; ink #182006 on lime.
- SF Pro / system sans. Controls normally 13–14 px, supporting metadata 12 px.
- Modest radii: controls 7–8 px, media/cards/panels 10–12 px.
- Borders define structure; no decorative glows, grain or floating ambient orbs.
- Keyboard focus is a visible lime outline. Motion indicates state, with reduced-motion support.

## Structure

Left navigation: generation modes; media library, references, styles; projects/workspaces; activity and settings. One top context header contains search and activity. Gallery offers a single row of filters. The stable composer is anchored below the gallery with measured scroll clearance. Secondary screens reuse the same tokens and domain services.

Chat and Inpaint are retired features. Existing images and legacy metadata are retained. Image iteration starts from an explicit source reference through “Variante erstellen”.

Default app branding uses `resources/icon.png`. The shared `BrandIcon` renders it in app settings; the renderer favicon and native macOS/Windows packaging use the same artwork. Navigation icons remain functional Lucide symbols.

The approved light sidebar variant is `resources/icon-sidebar-light.png`, selected via `BrandIcon variant="sidebar"`. The native app icon and app settings retain `resources/icon.png`.

The composer dock has a full-width, non-interactive dark scrim fading upward to transparency. It grounds cost and keyboard hints while retaining the gallery beneath, consistently across creation modes.

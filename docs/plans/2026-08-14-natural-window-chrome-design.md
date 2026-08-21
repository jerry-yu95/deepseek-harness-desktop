# Natural window chrome design

## Goal

Replace the bright, disconnected Windows title and menu bars with a calm top edge that belongs to the DeepSeek Harness Desktop visual system while preserving native window behavior.

## Chosen direction

Use Electron's native title-bar overlay for the Windows caption buttons and Snap integration, then place a thin renderer-owned drag surface beneath it. The surface follows the existing deep-sea instrument language: a dark blue-black material, a restrained cyan edge light, a compact sonar mark, and quiet context text. The application menu remains installed and available through the Alt key, but is hidden by default so it no longer forms a bright stripe above the interface.

This is preferred over a fully frameless window because native minimize, maximize, close, resizing, keyboard access, and Windows 11 Snap layouts remain intact. It is preferred over recoloring the stock frame because the stock title and menu rows would still feel visually separate from the application.

## Behavior and layout

- The chrome is 46 pixels high and reserves the native caption-button area on the right.
- The left side presents a small sonar aperture, the application name, and a context label such as `STARTUP`, `WEB SURFACE`, or `EXTENSION DOCK`.
- The entire non-button surface remains draggable and supports double-click maximize through the native title-bar overlay.
- Page content receives a matching top safe area so controls are never hidden beneath the overlay.
- Existing DSH pages are not rewritten. A small, isolated shell layer is inserted after each navigation and removed naturally with the document.
- Reduced-motion users receive no decorative animation. Narrow windows progressively hide secondary labels.

## Verification

- Unit-test the overlay options, generated chrome document script, and lifecycle installation.
- Run the complete desktop test suite.
- Capture both content screenshots and a real Windows window screenshot that includes the native frame.
- Confirm the title row is dark and continuous, the old always-visible menu stripe is gone, and native caption buttons remain available.

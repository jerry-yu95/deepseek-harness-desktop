// Desktop-owned adaptation of the official InputBar and its local toolbar slot.
// Keep SDK styles untouched; the Electron geometry regression guards these selectors.
export const COMPOSER_LAYOUT_CSS = `
[data-composer-card] { container: jiwei-composer / inline-size; }
[data-composer-card] [class$="_row"] {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 8px;
}
[data-composer-card] [class$="_row"] > [class$="_tools"] { gap: 8px; }
[data-composer-card] [class$="_row"] > [class$="_trailing"] {
  width: 100%;
  min-width: 0;
  gap: 8px;
  justify-content: flex-end;
}
[data-composer-card] [class$="_trailing"] > :not([class$="_primary"]) {
  min-width: 0;
  max-width: 100%;
  flex-shrink: 1;
}
[data-composer-card] [class$="_trailing"] button[class$="_trigger"] { max-width: 100%; }
[data-composer-card] [class$="_row"] button[class$="_primary"] { transform: none; }
@container jiwei-composer (min-width: 560px) {
  [data-composer-card] [class$="_row"] { grid-template-columns: max-content minmax(0, 1fr); }
}
@container jiwei-composer (max-width: 360px) {
  [data-composer-card] [class$="_tools"] [class*="_toolbarControl"] { font-size: 0; gap: 2px; }
}
`

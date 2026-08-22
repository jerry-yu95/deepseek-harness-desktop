/** CSS Modules import type (build preset inlines them into the client bundle). */
declare module '*.module.css' {
  const classes: Readonly<Record<string, string>>
  export default classes
}

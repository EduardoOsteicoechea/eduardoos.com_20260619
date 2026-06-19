/** Returns true when the pathname is the marketing home page. */
export function isHomePath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

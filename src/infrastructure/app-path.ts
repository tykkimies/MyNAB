/** Native forms and API redirects need an explicit prefix; Next Link/redirect add it themselves. */
export function appPath(path: string): string {
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`;
}

export type TokenPrimitive = string | number;
export type TokenTree = { [key: string]: TokenPrimitive | TokenTree };
export type StyleValue = TokenPrimitive | null | undefined;
export type StyleObject = Record<string, StyleValue>;

export interface Theme {
  tokens: TokenTree;
}

const UNITLESS = new Set([
  "opacity",
  "zIndex",
  "fontWeight",
  "lineHeight",
  "flex",
  "flexGrow",
  "flexShrink",
  "order",
]);

export function defineTheme(tokens: TokenTree): Theme {
  return { tokens };
}

export function getToken(theme: Theme, reference: string): TokenPrimitive | undefined {
  const path = reference.replace(/^\$/, "").split(".");
  let cursor: TokenPrimitive | TokenTree = theme.tokens;

  for (const segment of path) {
    if (!cursor || typeof cursor !== "object" || !(segment in cursor)) return undefined;
    cursor = cursor[segment];
  }

  return typeof cursor === "object" ? undefined : cursor;
}

export function resolveStyle(style: StyleObject, theme: Theme): StyleObject {
  const result: StyleObject = {};
  for (const [property, value] of Object.entries(style)) {
    if (typeof value === "string" && value.startsWith("$")) {
      const resolved = getToken(theme, value);
      if (resolved === undefined) throw new Error(`OneStack styles: unknown token ${value}.`);
      result[property] = resolved;
    } else {
      result[property] = value;
    }
  }
  return result;
}

function toKebabCase(property: string) {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function styleToCss(style: StyleObject, theme: Theme): string {
  const resolved = resolveStyle(style, theme);
  return Object.entries(resolved)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([property, value]) => {
      const serialized = typeof value === "number" && !UNITLESS.has(property) ? `${value}px` : String(value);
      return `${toKebabCase(property)}:${serialized}`;
    })
    .join(";");
}

export function compileUtilities(input: string, theme: Theme): StyleObject {
  const result: StyleObject = {};
  const spacing = (step: string) => getToken(theme, `$spacing.${step}`) ?? Number(step) * 4;
  const radius = (step: string) => getToken(theme, `$radius.${step}`) ?? Number(step) * 2;

  for (const utility of input.trim().split(/\s+/).filter(Boolean)) {
    if (utility === "flex") result.display = "flex";
    else if (utility === "grid") result.display = "grid";
    else if (utility === "items-center") result.alignItems = "center";
    else if (utility === "justify-center") result.justifyContent = "center";
    else if (utility === "w-full") result.width = "100%";
    else if (utility === "h-full") result.height = "100%";
    else if (utility.startsWith("gap-")) result.gap = spacing(utility.slice(4));
    else if (utility.startsWith("p-")) result.padding = spacing(utility.slice(2));
    else if (utility.startsWith("px-")) {
      result.paddingLeft = spacing(utility.slice(3));
      result.paddingRight = spacing(utility.slice(3));
    } else if (utility.startsWith("py-")) {
      result.paddingTop = spacing(utility.slice(3));
      result.paddingBottom = spacing(utility.slice(3));
    } else if (utility.startsWith("rounded-")) result.borderRadius = radius(utility.slice(8));
    else if (utility.startsWith("bg-")) result.background = `$colors.${utility.slice(3)}`;
    else if (utility.startsWith("text-")) result.color = `$colors.${utility.slice(5)}`;
  }

  return resolveStyle(result, theme);
}

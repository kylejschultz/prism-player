export function artistPlaceholder(name: string) {
  const words = name.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
  const first = Array.from(words[0] ?? "");
  const last = Array.from(words[words.length - 1] ?? "");
  const initials = (words.length > 1 ? `${first[0]}${last[0]}` : first.slice(0, 2).join("")).toLocaleUpperCase("en-US") || "?";
  let hash = 0;
  for (const character of name.normalize("NFC").trim().toLocaleLowerCase("en-US")) {
    hash = (Math.imul(hash, 31) + (character.codePointAt(0) ?? 0)) >>> 0;
  }
  return { initials, hue: hash % 360 };
}

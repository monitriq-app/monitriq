type ClassValue = string | number | null | undefined | false | ClassValue[];

/** Minimal class-list joiner for conditional Tailwind classes. */
export function cn(...values: ClassValue[]): string {
  const flat: string[] = [];
  const walk = (value: ClassValue) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    flat.push(String(value));
  };
  values.forEach(walk);
  return flat.join(" ");
}

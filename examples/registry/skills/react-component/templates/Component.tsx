export type ComponentProps = { readonly label: string };

export function Component({ label }: ComponentProps) {
  return <span>{label}</span>;
}

import { token } from "@repo/tokens";

// Placeholder page. The real marketing site is a later milestone -- see
// docs/marketplane/00-repo-map.md section 7 for why roughly 60% of the artboard's copy
// cannot ship as designed.
//
// This page exists to prove two things the layout decision rests on:
//   1. `bg-ground` resolves through @theme inline to --mp-ground in @repo/tokens/tokens.css.
//   2. `token()` is raw TypeScript imported from a workspace package with no build step,
//      compiled by Next via transpilePackages.
export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Workspace scaffold</h1>
      <p className="text-sm opacity-70">
        Placeholder page. Ground token resolves to <code>{token("--mp-ground")}</code> via{" "}
        <code>@repo/tokens</code>.
      </p>
    </main>
  );
}

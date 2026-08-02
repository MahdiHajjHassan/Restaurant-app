const FOUNDATION = [
  {
    name: "Next.js 16 + TypeScript strict",
    detail: "noUncheckedIndexedAccess on",
  },
  {
    name: "PostgreSQL 17 + Drizzle",
    detail: "dev and test databases, unprivileged runtime role",
  },
  {
    name: "Storage adapter",
    detail: "local disk now, Cloudflare R2 at launch",
  },
  { name: "core/ boundary", detail: "framework imports are a lint error" },
  {
    name: "Vitest + Playwright",
    detail: "unit, integration, and browser suites",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16">
      <div>
        <p className="text-sm font-medium tracking-wide text-[var(--color-accent)] uppercase">
          Phase 0
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-balance">
          Platform foundation
        </h1>
        <p className="mt-3 text-[var(--color-muted)]">
          Scaffolding only. The tenant core lands in Phase 1, and the public
          menu — the page customers actually see — in Phase 2.
        </p>
      </div>

      <ul className="flex flex-col gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border)]">
        {FOUNDATION.map((item) => (
          <li
            key={item.name}
            className="flex flex-col gap-0.5 bg-[var(--color-surface)] px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
          >
            <span className="font-medium">{item.name}</span>
            <span className="text-sm text-[var(--color-muted)]">
              {item.detail}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

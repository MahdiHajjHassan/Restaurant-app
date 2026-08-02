const FOUNDATION = [
  {
    name: "Next.js 16 + TypeScript strict",
    detail: "noUncheckedIndexedAccess on",
  },
  {
    name: "PostgreSQL 17 + Drizzle",
    detail: "two isolation layers, repository and RLS",
  },
  {
    name: "Multi-tenant routing",
    detail: "resolved by Host, verified domains only",
  },
  {
    name: "Public menu",
    detail: "bilingual EN/AR with RTL, live open status",
  },
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
          Phase 2
        </p>
        <h1 className="mt-2 font-display text-3xl text-balance">
          Restaurant platform
        </h1>
        <p className="mt-3 text-[var(--color-muted)]">
          One codebase, many restaurants. Each tenant resolves by its own
          hostname — try{" "}
          <code className="text-[var(--color-ink)]">
            alpha-grill.localhost:3000
          </code>
          .
        </p>
      </div>

      <ul className="flex flex-col gap-px overflow-hidden rounded-lg border border-[var(--color-rule)] bg-[var(--color-rule)]">
        {FOUNDATION.map((item) => (
          <li
            key={item.name}
            className="flex flex-col gap-0.5 bg-[var(--color-paper)] px-4 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
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

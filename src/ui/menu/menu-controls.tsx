"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface MenuControlsProps {
  categories: readonly { id: string; label: string }[];
  labels: {
    search: string;
    placeholder: string;
    clear: string;
  };
}

/**
 * The only interactive island on the page.
 *
 * It filters and highlights server-rendered markup rather than owning the menu
 * data. That matters twice over: the full menu is real HTML for Google and for
 * first paint, and a 90-item menu never gets serialised into the JS payload or
 * paid for again at hydration. The cost is that this reaches into the DOM,
 * which is the deliberate trade.
 */
export function MenuControls({ categories, labels }: MenuControlsProps) {
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string | null>(
    categories[0]?.id ?? null,
  );
  const railRef = useRef<HTMLDivElement>(null);

  const applyFilter = useCallback((value: string) => {
    const needle = value.trim().toLowerCase();
    let anyVisible = false;

    for (const section of document.querySelectorAll<HTMLElement>(
      "[data-category]",
    )) {
      let visibleCount = 0;

      for (const item of section.querySelectorAll<HTMLElement>("[data-item]")) {
        const matches =
          needle.length === 0 ||
          (item.dataset.search ?? "").includes(needle);
        item.hidden = !matches;
        if (matches) visibleCount += 1;
      }

      // A heading with nothing under it reads as a broken menu.
      section.hidden = visibleCount === 0;
      if (visibleCount > 0) anyVisible = true;
    }

    const empty = document.getElementById("menu-empty");
    if (empty) empty.hidden = anyVisible;
  }, []);

  useEffect(() => {
    applyFilter(query);
  }, [query, applyFilter]);

  // Track which category is in view so the rail says where you are.
  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-category]"),
    );
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        const first = visible[0]?.target.id;
        if (first) setActiveId(first.replace("category-", ""));
      },
      // A band near the top of the viewport, so the active chip changes when a
      // heading reaches reading position rather than when it merely appears.
      { rootMargin: "-15% 0px -75% 0px", threshold: 0 },
    );

    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);

  // Keep the active chip in view on a narrow phone rail.
  useEffect(() => {
    if (!activeId) return;
    railRef.current
      ?.querySelector(`[data-chip="${activeId}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId]);

  return (
    <div className="sticky top-0 z-10 -mx-6 border-b border-[var(--color-rule)] bg-[var(--color-paper)]/95 px-6 py-2.5 backdrop-blur">
      <div className="flex items-center gap-3">
        <div
          ref={railRef}
          className="flex flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((category) => {
            const active = category.id === activeId;
            return (
              <a
                key={category.id}
                data-chip={category.id}
                href={`#category-${category.id}`}
                aria-current={active ? "true" : undefined}
                className={`shrink-0 rounded-full px-2.5 py-1 text-[0.8rem] whitespace-nowrap transition-colors ${
                  active
                    ? "bg-[var(--color-accent)] text-[var(--color-on-accent)]"
                    : "text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                }`}
              >
                {category.label}
              </a>
            );
          })}
        </div>

        <div className="relative shrink-0">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label={labels.search}
            placeholder={labels.placeholder}
            className="w-28 rounded-full border border-[var(--color-rule)] bg-transparent px-3 py-1 text-[0.8rem] transition-[width] focus:w-40 focus:outline-none sm:w-36 sm:focus:w-48"
          />
        </div>
      </div>
    </div>
  );
}

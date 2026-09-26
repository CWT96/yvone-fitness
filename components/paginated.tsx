"use client";
import { useLanguage } from "@/components/language-provider";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { pageWindow } from "@/lib/pagination";

export function Paginated<T>({
  items,
  resetKey,
  label,
  tableColumns,
  children,
}: {
  items: T[];
  resetKey: unknown;
  label: string;
  tableColumns?: number;
  children: (items: T[], offset: number) => ReactNode;
}) {
  const { t } = useLanguage();
  const key = JSON.stringify(resetKey);
  const [position, setPosition] = useState({ key, page: 1 });
  const { page, pages, start, end } = pageWindow(
    items.length,
    position.key === key ? position.page : 1,
  );
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    setPosition((old) =>
      old.key === key && old.page === page ? old : { key, page },
    );
  }, [key, page]);
  function go(next: number) {
    setPosition({ key, page: next });
    const container =
      nav.current?.closest("table")?.parentElement ||
      nav.current?.parentElement;
    container?.scrollIntoView({ block: "start", behavior: "instant" });
  }
  const controls =
    items.length > 10 ? (
      <nav ref={nav} className="pagination" aria-label={t("{0}分页", [label])}>
        <span role="status">
          {t("共")}
          {items.length} {t("条 · 显示")}
          {start + 1}–{end} {t("条")}
        </span>
        <div className="row gap">
          <button
            type="button"
            className="btn secondary small"
            onClick={() => go(page - 1)}
            disabled={page === 1}
            aria-label={t("{0}上一页", [label])}
          >
            {t("上一页")}
          </button>
          <span>
            {t("第")}
            {page} / {pages} {t("页")}
          </span>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => go(page + 1)}
            disabled={page === pages}
            aria-label={t("{0}下一页", [label])}
          >
            {t("下一页")}
          </button>
        </div>
      </nav>
    ) : null;
  return (
    <>
      {children(items.slice(start, end), start)}
      {controls &&
        (tableColumns ? (
          <tr className="pagination-row">
            <td colSpan={tableColumns}>{controls}</td>
          </tr>
        ) : (
          controls
        ))}
    </>
  );
}

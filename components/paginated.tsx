"use client";
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
      <nav ref={nav} className="pagination" aria-label={`${label}分页`}>
        <span role="status">
          共 {items.length} 条 · 显示 {start + 1}–{end} 条
        </span>
        <div className="row gap">
          <button
            type="button"
            className="btn secondary small"
            onClick={() => go(page - 1)}
            disabled={page === 1}
            aria-label={`${label}上一页`}
          >
            上一页
          </button>
          <span>
            第 {page} / {pages} 页
          </span>
          <button
            type="button"
            className="btn secondary small"
            onClick={() => go(page + 1)}
            disabled={page === pages}
            aria-label={`${label}下一页`}
          >
            下一页
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

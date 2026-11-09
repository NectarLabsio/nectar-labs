"use client";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Sort value; column is sortable when present. */
  sort?: (row: T) => number | string | bigint;
  align?: "left" | "right";
}

export interface TableProps<T> {
  caption: string;
  columns: Array<Column<T>>;
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
}

/** Sortable table; stacks to labelled rows under 760 px (`.rt`). */
export function Table<T>({ caption, columns, rows, rowKey, empty }: TableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    const s = col.sort;
    return [...rows].sort((a, b) => {
      const x = s(a);
      const y = s(b);
      return (x < y ? -1 : x > y ? 1 : 0) * dir;
    });
  }, [rows, columns, sortKey, dir]);

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="table-wrap">
      <table className="t rt">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sortKey === c.key;
              return (
                <th key={c.key} scope="col" className={c.align === "right" ? "r" : undefined} aria-sort={active ? (dir === 1 ? "ascending" : "descending") : undefined}>
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (active) setDir(dir === 1 ? -1 : 1);
                        else {
                          setSortKey(c.key);
                          setDir(1);
                        }
                      }}
                    >
                      {c.header}
                      <span aria-hidden="true">{active ? (dir === 1 ? "↑" : "↓") : "↕"}</span>
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={rowKey(r)}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={c.align === "right" ? "r" : undefined}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

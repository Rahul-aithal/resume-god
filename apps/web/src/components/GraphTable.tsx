import { useMemo, useState } from "react";
import type { GraphNode, GraphProjection } from "@resume-god/api-client";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FirstPageIcon,
  LastPageIcon,
  SortAscIcon,
  SortDescIcon,
  SortNoneIcon,
} from "./icons";
import { SelectField } from "./SelectField";
import { Button, Input, KindBadge, cx } from "./ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";

type SortKey = "kind" | "label" | "detail" | "links";
type SortDir = "asc" | "desc";
type LinksFilter = "all" | "linked" | "unlinked";

const ALL_KINDS = "all";
const PAGE_SIZES = [10, 25, 50, 100];

const LINK_OPTIONS = [
  { value: "all", label: "Any links" },
  { value: "linked", label: "Has links" },
  { value: "unlinked", label: "No links" },
];

const PAGE_SIZE_OPTIONS = PAGE_SIZES.map((size) => ({
  value: String(size),
  label: `${size} per page`,
}));

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

const COLUMNS: Array<{
  key: SortKey;
  label: string;
  /** Counts read most usefully largest-first. */
  firstDir: SortDir;
  className?: string;
  numeric?: boolean;
}> = [
  { key: "kind", label: "Kind", firstDir: "asc", className: "w-36" },
  { key: "label", label: "Name", firstDir: "asc" },
  { key: "detail", label: "Detail", firstDir: "asc" },
  {
    key: "links",
    label: "Links",
    firstDir: "desc",
    className: "w-24",
    numeric: true,
  },
];

/** The graph's nodes as a filterable, sortable, paginated list. Rows open the
 * same inspector as the canvas. */
export default function GraphTable({
  projection,
  selectedId,
  onOpen,
}: {
  projection: GraphProjection;
  selectedId?: string;
  onOpen: (node: GraphNode) => void;
}) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState(ALL_KINDS);
  const [linksFilter, setLinksFilter] = useState<LinksFilter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [requestedPage, setRequestedPage] = useState(0);

  const links = useMemo(() => {
    const counts = new Map<string, number>();
    for (const edge of projection.edges) {
      counts.set(edge.from, (counts.get(edge.from) ?? 0) + 1);
      counts.set(edge.to, (counts.get(edge.to) ?? 0) + 1);
    }
    return counts;
  }, [projection.edges]);

  const kindOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const node of projection.nodes) {
      counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
    }
    return [
      { value: ALL_KINDS, label: "All kinds" },
      ...[...counts]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([value, count]) => ({
          value,
          label: `${value[0].toUpperCase()}${value.slice(1)} (${count})`,
        })),
    ];
  }, [projection.nodes]);

  // A kind can disappear when its last node is deleted or a new graph imported.
  const activeKind = kindOptions.some((option) => option.value === kind)
    ? kind
    : ALL_KINDS;

  const needle = query.trim().toLowerCase();
  const rows = useMemo(() => {
    const filtered = projection.nodes.filter((node) => {
      if (activeKind !== ALL_KINDS && node.kind !== activeKind) return false;
      const count = links.get(node.id) ?? 0;
      if (linksFilter === "linked" && count === 0) return false;
      if (linksFilter === "unlinked" && count > 0) return false;
      return (
        !needle ||
        `${node.kind} ${node.label} ${node.detail}`
          .toLowerCase()
          .includes(needle)
      );
    });
    if (!sort) return filtered;
    const direction = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const order =
        sort.key === "links"
          ? (links.get(a.id) ?? 0) - (links.get(b.id) ?? 0)
          : collator.compare(a[sort.key], b[sort.key]);
      return order * direction || collator.compare(a.label, b.label);
    });
  }, [projection.nodes, links, activeKind, linksFilter, needle, sort]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  // Derived so deleting the last row of the last page can't strand the view.
  const page = Math.min(requestedPage, pageCount - 1);
  const firstRow = page * pageSize;
  const pageRows = rows.slice(firstRow, firstRow + pageSize);

  const hasFilters =
    needle !== "" || activeKind !== ALL_KINDS || linksFilter !== "all";

  function toggleSort(key: SortKey, firstDir: SortDir) {
    setRequestedPage(0);
    setSort((current) => {
      if (current?.key !== key) return { key, dir: firstDir };
      // First direction, then the other, then back to the natural order.
      return current.dir === firstDir
        ? { key, dir: firstDir === "asc" ? "desc" : "asc" }
        : null;
    });
  }

  function clearFilters() {
    setQuery("");
    setKind(ALL_KINDS);
    setLinksFilter("all");
    setRequestedPage(0);
  }

  return (
    <div className="flex h-full flex-col gap-3 p-0.5">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="Search the graph"
          placeholder="Search by name, kind, or detail"
          className="min-w-48 flex-1"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setRequestedPage(0);
          }}
        />
        <SelectField
          aria-label="Filter by kind"
          className="w-44"
          value={activeKind}
          onValueChange={(next) => {
            setKind(next);
            setRequestedPage(0);
          }}
          options={kindOptions}
        />
        <SelectField
          aria-label="Filter by links"
          className="w-32"
          value={linksFilter}
          onValueChange={(next) => {
            setLinksFilter(next as LinksFilter);
            setRequestedPage(0);
          }}
          options={LINK_OPTIONS}
        />
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-line bg-surface [&>[data-slot=table-container]]:max-h-full [&>[data-slot=table-container]]:overflow-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {COLUMNS.map((column) => {
                const active = sort?.key === column.key;
                const SortIcon = !active
                  ? SortNoneIcon
                  : sort.dir === "asc"
                    ? SortAscIcon
                    : SortDescIcon;
                return (
                  <TableHead
                    key={column.key}
                    aria-sort={
                      !active
                        ? "none"
                        : sort.dir === "asc"
                          ? "ascending"
                          : "descending"
                    }
                    className={cx(
                      "sticky top-0 z-10 bg-surface",
                      column.className,
                      column.numeric && "text-right",
                    )}
                  >
                    <button
                      type="button"
                      className={cx(
                        "inline-flex items-center gap-1 hover:text-ink",
                        column.numeric && "flex-row-reverse",
                        active ? "text-ink" : "text-ink-2",
                      )}
                      onClick={() => toggleSort(column.key, column.firstDir)}
                    >
                      {column.label}
                      <SortIcon
                        className={cx("size-3.5", !active && "opacity-50")}
                      />
                    </button>
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.map((node) => (
              <TableRow
                key={node.id}
                className={cx(
                  "cursor-pointer",
                  node.id === selectedId && "bg-surface-2",
                )}
                onClick={() => onOpen(node)}
              >
                <TableCell>
                  <KindBadge kind={node.kind} />
                </TableCell>
                <TableCell className="max-w-96 whitespace-normal">
                  <button
                    type="button"
                    className="text-left font-medium hover:underline"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(node);
                    }}
                  >
                    {node.label}
                  </button>
                </TableCell>
                <TableCell className="whitespace-normal text-ink-2">
                  {node.detail || "—"}
                </TableCell>
                <TableCell className="tnum text-right text-ink-2">
                  {links.get(node.id) ?? 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {rows.length === 0 && (
          <p className="p-6 text-center text-[13px] text-ink-2">
            {hasFilters
              ? "Nothing matches these filters."
              : "Your graph is empty. Add knowledge or import a profile."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="tnum text-xs text-ink-2" aria-live="polite">
          {rows.length === 0
            ? "No results"
            : `Showing ${firstRow + 1}–${firstRow + pageRows.length} of ${rows.length}`}
          {hasFilters && ` (filtered from ${projection.nodes.length})`}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <SelectField
            aria-label="Rows per page"
            size="sm"
            className="w-32"
            value={String(pageSize)}
            onValueChange={(next) => {
              setPageSize(Number(next));
              setRequestedPage(0);
            }}
            options={PAGE_SIZE_OPTIONS}
          />
          <span className="tnum px-1.5 text-xs text-ink-2">
            Page {page + 1} of {pageCount}
          </span>
          <PageButton
            label="First page"
            disabled={page === 0}
            onClick={() => setRequestedPage(0)}
          >
            <FirstPageIcon className="size-4" />
          </PageButton>
          <PageButton
            label="Previous page"
            disabled={page === 0}
            onClick={() => setRequestedPage(page - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </PageButton>
          <PageButton
            label="Next page"
            disabled={page >= pageCount - 1}
            onClick={() => setRequestedPage(page + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </PageButton>
          <PageButton
            label="Last page"
            disabled={page >= pageCount - 1}
            onClick={() => setRequestedPage(pageCount - 1)}
          >
            <LastPageIcon className="size-4" />
          </PageButton>
        </div>
      </div>
    </div>
  );
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant="secondary"
      size="sm"
      className="size-8 p-0"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

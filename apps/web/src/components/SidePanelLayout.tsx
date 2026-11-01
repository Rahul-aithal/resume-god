import { useEffect, useState, type ReactNode } from "react";
import { useDefaultLayout, usePanelRef } from "react-resizable-panels";
import { useIsDesktop } from "../lib/use-is-desktop";
import { PanelCloseIcon, PanelOpenIcon } from "./icons";
import { Button } from "./ui";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "./ui/resizable";

/**
 * Main content beside a side panel the user can close and drag to resize.
 * The size and open state persist per `id`. Below `lg` the panel stacks under
 * the content instead, and can still be closed.
 */
export default function SidePanelLayout({
  id,
  side,
  sideLabel,
  toolbar,
  reveal,
  heightClass,
  children,
}: {
  id: string;
  side: ReactNode;
  /** Names the panel in the toggle, e.g. "panel" gives "Hide panel". */
  sideLabel: string;
  toolbar?: ReactNode;
  /** Reopens the panel whenever this changes to a truthy value. */
  reveal?: unknown;
  /** Desktop height, as a Tailwind class. */
  heightClass: string;
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const panel = usePanelRef();
  const layout = useDefaultLayout({ id });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!reveal) return;
    panel.current?.expand();
    setOpen(true);
  }, [reveal, panel]);

  function toggle() {
    if (isDesktop && panel.current) {
      if (panel.current.isCollapsed()) panel.current.expand();
      else panel.current.collapse();
    } else {
      setOpen((value) => !value);
    }
  }

  const header = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">{toolbar}</div>
      <Button
        variant="ghost"
        size="sm"
        className="shrink-0"
        aria-expanded={open}
        onClick={toggle}
      >
        {open ? (
          <PanelCloseIcon className="size-4" />
        ) : (
          <PanelOpenIcon className="size-4" />
        )}
        {open ? `Hide ${sideLabel}` : `Show ${sideLabel}`}
      </Button>
    </div>
  );

  if (!isDesktop) {
    return (
      <div className="space-y-3">
        {header}
        {children}
        {open && <div className="space-y-4">{side}</div>}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-3 ${heightClass}`}>
      {header}
      <div className="min-h-0 flex-1">
        <ResizablePanelGroup
          id={id}
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
        >
          <ResizablePanel id="main" minSize={320}>
            <div className="h-full pr-3">{children}</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel
            id="side"
            panelRef={panel}
            collapsible
            defaultSize={340}
            minSize={260}
            maxSize="60"
            onResize={(size) => setOpen(size.asPercentage > 0)}
          >
            {/* inert keeps a closed panel's fields out of the Tab order. */}
            <div
              className="h-full space-y-4 overflow-y-auto pl-3"
              inert={!open}
            >
              {side}
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

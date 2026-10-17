import * as React from "react"
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu"
import { Check, ChevronRight, Circle } from "lucide-react"

import { cn } from "@/shared/lib/utils/utils"
import { getPopupLayerContainer } from "@/shared/lib/popup-layer"

const ContextMenu = ContextMenuPrimitive.Root

const ContextMenuTrigger = ContextMenuPrimitive.Trigger

const ContextMenuGroup = ContextMenuPrimitive.Group

const ContextMenuPortal = ContextMenuPrimitive.Portal

const ContextMenuSub = ContextMenuPrimitive.Sub

const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => (
  <ContextMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      "flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  >
    {children}
    <ChevronRight className="ml-auto h-4 w-4" />
  </ContextMenuPrimitive.SubTrigger>
))
ContextMenuSubTrigger.displayName = ContextMenuPrimitive.SubTrigger.displayName

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => {
  const portalContainer = getPopupLayerContainer() ?? undefined;
  return (
    <ContextMenuPrimitive.Portal container={portalContainer}>
      <ContextMenuPrimitive.SubContent
        ref={ref}
        className={cn(
          "z-[10000] min-w-[8rem] overflow-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-[shadow:var(--shadow-popover)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
})
ContextMenuSubContent.displayName = ContextMenuPrimitive.SubContent.displayName

// ─── Stale-placement guard ───────────────────────────────────────────────────
//
// With real mouse input, Radix places the menu once against a stale virtual
// anchor (often (0,0) → top-left corner) and corrects it ~40ms later. The
// enter fade runs on the compositor, so that wrong placement is visible as a
// flash. We remember where the right-click happened and keep the content
// hidden until the popper wrapper actually sits at that point.

let lastContextMenuPoint: { x: number; y: number; t: number } | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(
    "contextmenu",
    (e) => {
      lastContextMenuPoint = { x: e.clientX, y: e.clientY, t: performance.now() }
    },
    true
  )
}

/** Max age of the recorded right-click for it to count as "this" open. */
const POINT_MAX_AGE_MS = 1000
/** Never keep the menu hidden longer than this, whatever happens. */
const REVEAL_FALLBACK_MS = 200
/** Slack around the wrapper rect (sideOffset is 2px). */
const POINT_SLACK_PX = 4

/**
 * Called when the Radix content element mounts (callback ref, since the
 * content only exists while open). Returns a cleanup, or undefined.
 */
function guardStalePlacement(content: HTMLElement): (() => void) | undefined {
  const wrapper = content.parentElement
  const point = lastContextMenuPoint
  if (!wrapper || !point) return
  if (performance.now() - point.t > POINT_MAX_AGE_MS) return

  // A context menu opens to the right of the pointer (or flips to its left),
  // so one vertical edge must sit at point.x. Mere containment is not enough:
  // the stale top-left placement can cover a pointer near the top of the page.
  const isAtPointer = () => {
    const r = wrapper.getBoundingClientRect()
    const edgeAtX =
      Math.abs(r.left - point.x) <= POINT_SLACK_PX ||
      Math.abs(r.right - point.x) <= POINT_SLACK_PX
    return (
      edgeAtX &&
      point.y >= r.top - POINT_SLACK_PX &&
      point.y <= r.bottom + POINT_SLACK_PX
    )
  }

  // At mount the wrapper is still parked off-screen (translate(0,-200%)),
  // so this hides the content until a placement lands on the pointer.
  content.style.visibility = "hidden"
  let done = false
  const stop = () => {
    done = true
    observer.disconnect()
    window.clearTimeout(fallback)
  }
  const reveal = () => {
    if (done) return
    stop()
    content.style.visibility = ""
    // Restart the enter animation so the fade starts at the real position.
    content.getAnimations().forEach((a) => {
      a.currentTime = 0
    })
  }
  const observer = new MutationObserver(() => {
    if (isAtPointer()) reveal()
  })
  observer.observe(wrapper, { attributes: true, attributeFilter: ["style"] })
  const fallback = window.setTimeout(reveal, REVEAL_FALLBACK_MS)
  return stop
}

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => {
  const portalContainer = getPopupLayerContainer() ?? undefined;
  const cleanupRef = React.useRef<(() => void) | undefined>(undefined);
  const setContentRef = React.useCallback(
    (el: HTMLDivElement | null) => {
      cleanupRef.current?.();
      cleanupRef.current = el ? guardStalePlacement(el) : undefined;
      if (typeof ref === "function") ref(el);
      else if (ref) ref.current = el;
    },
    [ref]
  );
  return (
    <ContextMenuPrimitive.Portal container={portalContainer}>
      <ContextMenuPrimitive.Content
        ref={setContentRef}
        className={cn(
          "z-[10000] min-w-[8rem] overflow-hidden rounded-md bg-popover p-1 text-popover-foreground shadow-[shadow:var(--shadow-popover)] animate-in fade-in-80 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  );
})
ContextMenuContent.displayName = ContextMenuPrimitive.Content.displayName

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
ContextMenuItem.displayName = ContextMenuPrimitive.Item.displayName

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <ContextMenuPrimitive.CheckboxItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    checked={checked}
    {...props}
  >
    {children}
    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
  </ContextMenuPrimitive.CheckboxItem>
))
ContextMenuCheckboxItem.displayName =
  ContextMenuPrimitive.CheckboxItem.displayName

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <ContextMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <ContextMenuPrimitive.ItemIndicator>
        <Circle className="h-2 w-2 fill-current" />
      </ContextMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </ContextMenuPrimitive.RadioItem>
))
ContextMenuRadioItem.displayName = ContextMenuPrimitive.RadioItem.displayName

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => (
  <ContextMenuPrimitive.Label
    ref={ref}
    className={cn(
      "px-2 py-1.5 text-sm font-semibold text-foreground",
      inset && "pl-8",
      className
    )}
    {...props}
  />
))
ContextMenuLabel.displayName = ContextMenuPrimitive.Label.displayName

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <ContextMenuPrimitive.Separator
    ref={ref}
    className={cn("my-2 mx-2 h-px bg-border/50", className)}
    {...props}
  />
))
ContextMenuSeparator.displayName = ContextMenuPrimitive.Separator.displayName

const ContextMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn(
        "ml-auto text-xs tracking-widest text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}
ContextMenuShortcut.displayName = "ContextMenuShortcut"

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}

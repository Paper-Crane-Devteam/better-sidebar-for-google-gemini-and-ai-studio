import React from 'react';

/**
 * Lets custom content rendered inside a menu (e.g. a color grid inside a
 * submenu) close the menu it lives in, without knowing whether it sits in a
 * context menu or a three-dot dropdown.
 *
 * Radix closes a menu automatically when a real MenuItem is selected, but
 * custom children are plain DOM and get no such treatment. Anything that needs
 * to hand control over to another layer (a popover, a modal) calls
 * `useMenuDismiss()` first.
 *
 * The default is a no-op, so the same component also works outside any menu.
 */
const MenuDismissContext = React.createContext<() => void>(() => {});

export const MenuDismissProvider = MenuDismissContext.Provider;

export const useMenuDismiss = () => React.useContext(MenuDismissContext);

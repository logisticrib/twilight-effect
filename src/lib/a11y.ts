import type { KeyboardEvent } from 'react';

/** Spread onto a clickable div to make it keyboard-operable: focusable, announced
 *  as a button, and activated with Enter/Space. `disabled` keeps the element
 *  rendered but drops it from the tab order and suppresses activation.
 *  Activation stops propagation so the game-level key handler (Enter = advance
 *  phase, Tab = cycle units) never doubles up with a focused control. */
export function btnProps(onClick: (() => void) | undefined, disabled = false) {
  const active = !!onClick && !disabled;
  return {
    role: 'button' as const,
    tabIndex: active ? 0 : -1,
    'aria-disabled': active ? undefined : true,
    onClick: active ? onClick : undefined,
    onKeyDown: active
      ? (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onClick!();
          }
        }
      : undefined,
  };
}

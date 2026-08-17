import { useEffect, useRef } from 'react';

/**
 * Close a popover when the user clicks away or presses Escape.
 *
 * Every menu in the header used to close only by clicking its own trigger again,
 * so opening one and then clicking anywhere else left it hanging over the page.
 *
 * Returns a ref to put on the outermost element of the popover *including* its
 * trigger — a pointerdown inside that subtree is treated as "still using it".
 */
export function useDismissable(open, onClose) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const awayHandler = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      onClose();
    };
    const keyHandler = (event) => {
      if (event.key === 'Escape') onClose();
    };

    // pointerdown rather than click: the menu should go before the click lands on
    // whatever is underneath, so a link behind it still receives its own click.
    document.addEventListener('pointerdown', awayHandler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('pointerdown', awayHandler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [open, onClose]);

  return ref;
}

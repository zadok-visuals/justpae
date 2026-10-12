"use client";

import { useId } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";

/**
 * Full-size view of one image.
 *
 * Exists because a document thumbnail is not enough to answer the only
 * question anyone asks of it — "is this actually readable?" The user asking it
 * is about to submit the photo for review; the reviewer asking it is deciding
 * whether to reject the account.
 *
 * Reuses the Modal primitive, so Escape, the focus trap and backdrop-dismiss
 * all come from the same place as every other dialog.
 */
export function Lightbox({
  open,
  src,
  alt,
  onClose,
}: {
  open: boolean;
  src: string | null;
  alt: string;
  onClose: () => void;
}) {
  const titleId = useId();

  return (
    <Modal open={open && Boolean(src)} onClose={onClose} labelledBy={titleId} className="p-3">
      <h2 id={titleId} className="sr-only">
        {alt}
      </h2>

      {src && (
        // A blob: or signed storage URL — neither is something next/image can
        // optimise, and both are short-lived by design.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className="mx-auto max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
        />
      )}

      <Button
        type="button"
        variant="secondary"
        size="md"
        fullWidth
        className="mt-3"
        onClick={onClose}
      >
        Close
      </Button>
    </Modal>
  );
}

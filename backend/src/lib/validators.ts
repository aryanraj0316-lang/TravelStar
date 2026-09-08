import { z } from 'zod';

/**
 * A URL for an image/video that other people will load.
 *
 * `z.string().url()` is not enough on its own: it delegates to the URL
 * constructor, which happily accepts `file:///data/user/0/.../cache/x.jpeg`,
 * `blob:...`, `data:...` and `javascript:...`. Those are not shareable
 * addresses:
 *
 * - `file:`/`blob:` point at storage on one device. A client that fell back
 *   to the image picker's raw `uri` when an upload failed could persist one
 *   as a user's avatar or a trip's cover photo — it rendered for that one
 *   person, and was permanently broken for everybody else. That is exactly
 *   what happened with avatar upload while object storage was unconfigured.
 * - `data:` inlines the bytes into the column, so a "URL" field silently
 *   becomes a blob store.
 * - `javascript:` is an XSS payload the moment any surface renders the
 *   value into an anchor or an iframe.
 *
 * Media reaches this API one way: upload to object storage through a
 * presigned URL, then send back the public https URL that returns. So the
 * scheme allowlist is the whole rule.
 */
export const remoteMediaUrl = z
  .string()
  .max(2000)
  .refine(
    (value) => {
      let parsed: URL;
      try {
        parsed = new URL(value);
      } catch {
        return false;
      }
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    },
    {
      message: 'Must be an http(s) URL. Device-local paths (file:, blob:, data:) are not stored.',
    },
  );

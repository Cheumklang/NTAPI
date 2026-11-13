'use strict';

/**
 * Keep a request under the provider's image cap.
 *
 * pi stores every image it reads or looks at in the conversation, and sends the
 * whole conversation on every call. Coarena rejects a request that carries more
 * than 8 images ("unsupported_content"), which a long render-QC run reaches
 * quickly. Before each provider call we keep the newest images and replace the
 * older ones with a short text placeholder, so the model still sees that it
 * looked at something without resending the pixels.
 *
 * Only content blocks change: message roles, ids and tool pairing stay intact.
 */

const OMITTED = '[image omitted: the provider allows only a few images per request]';

function pruneImages(messages, maxImages = 6, maxBytes = 1_200_000) {
  if (!Array.isArray(messages)) return messages;

  // Count from the end so the most recent pictures survive, and stop as soon as
  // the retained pixels would blow the request-body budget. Providers cap both
  // count (Coarena: 8) and size (Token Harbor: 4 MB per request), and two full
  // screenshots already reach the size cap on their own.
  let seen = 0;
  let bytes = 0;
  const out = new Array(messages.length);

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (!message || !Array.isArray(message.content)) {
      out[i] = message;
      continue;
    }

    let changed = false;
    const content = new Array(message.content.length);
    for (let j = message.content.length - 1; j >= 0; j -= 1) {
      const block = message.content[j];
      if (block && block.type === 'image') {
        const len = typeof block.data === 'string' ? block.data.length : 0;
        if (seen >= maxImages || bytes + len > maxBytes) {
          content[j] = { type: 'text', text: OMITTED };
          changed = true;
          continue;
        }
        seen += 1;
        bytes += len;
      }
      content[j] = block;
    }

    out[i] = changed ? { ...message, content } : message;
  }

  return out;
}

module.exports = { pruneImages, OMITTED };

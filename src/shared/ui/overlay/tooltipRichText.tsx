// GENERATED from packages/ui/src/overlay/tooltipRichText.tsx — do not edit here.
// Improve it in the blueprint's packages/ and run `npm run sync` (blueprint skill).
import { Fragment, type ReactNode } from 'react';

/**
 * A closed inline-markup vocabulary for `Tooltip.tsx`'s text, so a call site
 * can say `{...tooltip('[[b]]Full title[[/b]]\n\nRest of the hint')}` and get
 * a bold heading with a paragraph break, instead of one flat sentence.
 *
 *   \n                 -> a line break (a blank line is two in a row)
 *   [[b]]...[[/b]]     -> bold      (<strong>)
 *   [[i]]...[[/i]]     -> italic    (<em>)
 *   [[u]]...[[/u]]     -> underline (<u>)
 *
 * Same bracket-tag convention as the i18n rich-copy editor
 * (`i18n-edit/richText.tsx`'s `[[b]]`/`[[i]]`) - one small vocabulary across
 * the house stack rather than two competing ones. Tags nest freely via a tag
 * stack (bold AND italic at once works exactly as you'd expect); an unmatched
 * close is dropped rather than corrupting the tree, and an unterminated open
 * tag is flushed at the end instead of losing its content.
 *
 * DELIBERATELY NOT HTML. `tooltip(text)` text often comes straight off
 * caller-supplied or third-party content (a regulator's own summary
 * paragraph, an inbound email subject, a person's own field value) - so this
 * parses a FIXED, CLOSED token set into React elements and never touches
 * `dangerouslySetInnerHTML`. A literal "<b>" or "<script>" anywhere in that
 * text renders as inert text, exactly as it always did; only the bracket
 * tokens above do anything, and they can only ever produce
 * `<strong>`/`<em>`/`<u>`/`<br/>` - nothing else is reachable through this
 * parser, so a call site can safely feed it text it does not fully control.
 */
const TOKEN_RE = /(\n|\[\[b\]\]|\[\[\/b\]\]|\[\[i\]\]|\[\[\/i\]\]|\[\[u\]\]|\[\[\/u\]\])/g;

const OPEN_TAGS: Record<string, string> = { '[[b]]': 'b', '[[i]]': 'i', '[[u]]': 'u' };
const CLOSE_TAGS: Record<string, string> = { '[[/b]]': 'b', '[[/i]]': 'i', '[[/u]]': 'u' };

interface Frame {
  tag: string | null;
  children: ReactNode[];
}

function renderFrame(frame: Frame, key: number): ReactNode {
  switch (frame.tag) {
    case 'b':
      return <strong key={key}>{frame.children}</strong>;
    case 'i':
      return <em key={key}>{frame.children}</em>;
    case 'u':
      return <u key={key}>{frame.children}</u>;
    default:
      return <Fragment key={key}>{frame.children}</Fragment>;
  }
}

/**
 * Parse tooltip text into the React nodes the panel renders. Plain text with
 * none of the tokens above (the overwhelming majority of the app's ~85+
 * tooltip call sites) is returned as-is - this is a no-op for every existing
 * hint.
 */
export function renderTooltipContent(text: string): ReactNode {
  if (!text.includes('\n') && !text.includes('[[')) return text;

  const parts = text.split(TOKEN_RE);
  const root: Frame = { tag: null, children: [] };
  const stack: Frame[] = [root];
  let key = 0;
  const top = () => stack[stack.length - 1];

  for (const part of parts) {
    if (!part) continue;
    if (part === '\n') {
      top().children.push(<br key={key++} />);
    } else if (OPEN_TAGS[part]) {
      stack.push({ tag: OPEN_TAGS[part], children: [] });
    } else if (CLOSE_TAGS[part]) {
      const tag = CLOSE_TAGS[part];
      const idx = stack.map((f) => f.tag).lastIndexOf(tag);
      // Pop back to (and including) the matching open frame, closing any
      // inner still-open tags along the way rather than corrupting the tree.
      // A stray close with no matching open (idx === -1, or only the root at
      // idx 0) is dropped silently.
      if (idx > 0) {
        while (stack.length > idx) {
          const frame = stack.pop()!;
          top().children.push(renderFrame(frame, key++));
        }
      }
    } else {
      top().children.push(part);
    }
  }
  // Flush any still-open frames (unterminated tag) rather than losing them.
  while (stack.length > 1) {
    const frame = stack.pop()!;
    top().children.push(renderFrame(frame, key++));
  }
  return root.children;
}

/**
 * Neutralize any `[[...]]` token sequence in text that must render as
 * LITERAL content when it is composed into a larger, formatted tooltip
 * string - e.g. a title or a summary pulled from a source this app does not
 * control. Inserts a zero-width space inside the opening bracket pair: it
 * costs the token parser its match (which requires the literal `[[`) but is
 * invisible on screen, so `[[b]]` in a regulator's own copy renders as the
 * four characters it is rather than either vanishing or being interpreted.
 *
 * Call this on any UNTRUSTED piece before splicing it next to a `[[b]]`,
 * `[[i]]` or `[[u]]` you add yourself - never on the whole composed string,
 * which would also neutralize your own tags.
 */
export function escapeTooltipMarkup(text: string): string {
  return text.replace(/\[\[/g, '[​[');
}

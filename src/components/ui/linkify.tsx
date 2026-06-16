import { splitOnUrls } from '@/lib/linkify'

/**
 * Render a plain-text string with any URLs turned into clickable links that
 * open in a new tab. App-wide rule: a hyperlink anywhere should be clickable.
 *
 * Drop into any paragraph that renders user-entered free text (captions,
 * designer notes, profile narrative, pin comments, ...). Long URLs wrap via
 * `break-all` on the link; give the surrounding <p> `break-words` too for
 * non-URL long tokens.
 */
export function Linkify({ text }: { text: string }) {
  return (
    <>
      {splitOnUrls(text).map((tok, i) =>
        tok.type === 'link' ? (
          <a
            key={i}
            href={tok.href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-blue-600 underline underline-offset-2 hover:text-blue-700"
          >
            {tok.value}
          </a>
        ) : (
          <span key={i}>{tok.value}</span>
        ),
      )}
    </>
  )
}

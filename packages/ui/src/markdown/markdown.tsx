/**
 * Markdown prose — PR and issue bodies, review comments, release notes. The
 * source is written by strangers on the host, so the pipeline is a security
 * boundary, not a formatting preference:
 * - remark-gfm: tables, task lists, strikethrough, autolinks.
 * - remark-breaks: soft line breaks -> <br>, the way GitHub renders them.
 * - rehype-raw: actually render the embedded HTML those bodies routinely
 *   carry (Dependabot's <details> release notes, <blockquote>, tables).
 * - rehype-sanitize with `sanitizeSchema`: the allowlist that makes the step
 *   above safe. It is hast-util-sanitize's GitHub-shaped default, widened
 *   only by <details>/<summary> so collapsibles survive. Never render this
 *   component's input through rehype-raw without it — <script>, event
 *   handlers and `javascript:` URLs all arrive in real bodies, and the
 *   sanitize-* fixtures are the standing proof they stay inert.
 *
 * Host seams, both optional so the component renders from a fixture alone:
 * `openExternal` is where a link goes when clicked — links never navigate the
 * webview, so the click is cancelled whether or not a host supplied one;
 * `renderImage` lets a host intercept an <img> before it is emitted (the
 * desktop swaps GitLab upload paths for authenticated blobs) and returns null
 * to accept the plain image. Host-specific source rewriting happens before
 * the string arrives — this component renders the markdown it is given.
 *
 * ```suggestion fences are not code samples: they render as a proposed change
 * whose lines wear the diff's "added" skin, with a copy button. Applying one
 * from Nod is out of scope — no host exposes a public REST endpoint for it.
 */

import { Check, Copy } from "lucide-react";
import {
  type ComponentPropsWithoutRef,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { cn } from "../cn/cn.ts";
import "./markdown.css";

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"],
};

export type MarkdownImageProps = ComponentPropsWithoutRef<"img">;

export interface MarkdownProps {
  children: string;
  className?: string;
  /** Tokenises one line of a ```suggestion block. The host owns the
   *  highlighter (it knows the file's language); without it the block renders
   *  as plain text, which is what fixtures do. Must return escaped HTML. */
  highlightLine?: (code: string) => string;
  /** Highlight a fenced block by its fence language (```ts …). Plain fences
   *  in chat answers carry a language but no filename, so the line
   *  highlighter above cannot serve them. */
  highlightFence?: (code: string, lang: string) => string;
  openExternal?: (url: string) => void;
  renderImage?: (props: MarkdownImageProps) => ReactNode | null;
}

const TRAILING_NEWLINE_RE = /\n$/;

type AnchorProps = ComponentPropsWithoutRef<"a"> & { node?: unknown };

function makeAnchor(openExternal: MarkdownProps["openExternal"]) {
  return function Anchor({
    href,
    children,
    node: _node,
    ...rest
  }: AnchorProps) {
    const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
      e.preventDefault();
      if (href) {
        openExternal?.(href);
      }
    };
    return (
      <a {...rest} href={href} onClick={onClick}>
        {children}
      </a>
    );
  };
}

/** The fence language of a hast <code> node, or null. */
function fenceLang(node: unknown): string | null {
  const cls = (node as { properties?: { className?: unknown } } | undefined)
    ?.properties?.className;
  if (!Array.isArray(cls)) {
    return null;
  }
  const lang = cls.find(
    (c): c is string => typeof c === "string" && c.startsWith("language-")
  );
  return lang ? lang.slice("language-".length) : null;
}

function isSuggestionLang(lang: string | null): boolean {
  return (
    lang !== null && (lang === "suggestion" || lang.startsWith("suggestion:"))
  );
}

/** Flatten a code element's children to the raw fenced text. */
function codeText(children: unknown): string {
  if (typeof children === "string") {
    return children;
  }
  if (Array.isArray(children)) {
    return children.map(codeText).join("");
  }
  return "";
}

function SuggestionCard({
  highlightLine,
  text,
}: {
  highlightLine?: (code: string) => string;
  text: string;
}) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    []
  );

  const body = text.replace(TRAILING_NEWLINE_RE, "");
  const lines = body.split("\n");

  const onCopy = () => {
    navigator.clipboard?.writeText(body).catch(() => undefined);
    setCopied(true);
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="md-suggestion">
      <div className="md-suggestion-head">
        <span>Suggested change</span>
        <button
          className={cn("md-suggestion-copy", copied && "md-suggestion-copied")}
          onClick={onCopy}
          type="button"
        >
          {copied ? (
            <Check aria-hidden size={12} />
          ) : (
            <Copy aria-hidden size={12} />
          )}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="md-suggestion-body">
        {body.trim() === "" ? (
          <div className="md-suggestion-line md-suggestion-removes">
            Removes the selected lines
          </div>
        ) : (
          lines.map((line, index) =>
            highlightLine ? (
              <div
                className="md-suggestion-line"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: the host highlighter escapes what it does not tokenize (lib/highlight.ts)
                dangerouslySetInnerHTML={{ __html: highlightLine(line) }}
                // biome-ignore lint/suspicious/noArrayIndexKey: suggestion lines are positional and repeat verbatim
                key={index} // react-doctor-disable-line no-array-index-as-key -- rendered whole, never reordered; duplicate lines are common in a diff
              />
            ) : (
              <div
                className="md-suggestion-line"
                // biome-ignore lint/suspicious/noArrayIndexKey: suggestion lines are positional and repeat verbatim
                key={index} // react-doctor-disable-line no-array-index-as-key -- rendered whole, never reordered; duplicate lines are common in a diff
              >
                {line}
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}

type PreProps = ComponentPropsWithoutRef<"pre"> & {
  node?: { children?: unknown[] };
};

/** Unwrap suggestion fences from <pre> so the card isn't nested in a code box. */
function Pre({ node, children, ...rest }: PreProps) {
  const codeNode = node?.children?.[0];
  if (isSuggestionLang(fenceLang(codeNode))) {
    return <>{children}</>;
  }
  return <pre {...rest}>{children}</pre>;
}

type CodeProps = ComponentPropsWithoutRef<"code"> & { node?: unknown };

function makeCode(
  highlightLine: MarkdownProps["highlightLine"],
  highlightFence: MarkdownProps["highlightFence"]
) {
  return function Code({ node, className, children, ...rest }: CodeProps) {
    const lang = fenceLang(node);
    if (isSuggestionLang(lang)) {
      return (
        <SuggestionCard
          highlightLine={highlightLine}
          text={codeText(children)}
        />
      );
    }
    // A fenced block that names its language gets real tokens; inline code
    // and bare fences stay text. The host highlighter escapes everything it
    // does not tokenize.
    if (lang && highlightFence) {
      return (
        <code
          className={className}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the host highlighter escapes what it does not tokenize (lib/highlight.ts)
          dangerouslySetInnerHTML={{
            __html: highlightFence(codeText(children), lang),
          }}
          {...rest}
        />
      );
    }
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  };
}

type ImgProps = MarkdownImageProps & { node?: unknown };

function makeImg(renderImage: MarkdownProps["renderImage"]) {
  return function Img({ node: _node, alt, ...rest }: ImgProps) {
    const replaced = renderImage?.({ alt, ...rest });
    if (replaced) {
      return replaced;
    }
    return (
      // biome-ignore lint/correctness/useImageSize: source markdown carries no dimensions
      <img alt={alt ?? ""} {...rest} />
    );
  };
}

export function Markdown({
  children,
  className,
  highlightFence,
  highlightLine,
  openExternal,
  renderImage,
}: MarkdownProps) {
  if (!children) {
    return null;
  }
  return (
    <div className={cn("md", className)}>
      <ReactMarkdown
        components={{
          a: makeAnchor(openExternal),
          code: makeCode(highlightLine, highlightFence),
          img: makeImg(renderImage),
          pre: Pre,
        }}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
        remarkPlugins={[remarkGfm, remarkBreaks]}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

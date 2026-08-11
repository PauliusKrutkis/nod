/**
 * The sanitiser is the reason this component can render host-authored bodies
 * at all, so its contract is asserted here rather than left to the derived
 * catalog pass, which only proves a fixture renders. Every case below is a
 * payload that executes in a webview if rehype-sanitize is ever dropped,
 * reordered after rehype-raw's output, or handed a wider schema.
 *
 * The seam tests cover what fixtures cannot: that a click on a link is
 * cancelled and routed to the host instead of navigating the webview.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Markdown } from "./markdown.tsx";

afterEach(cleanup);

const EXECUTABLE_SCHEME_RE = /^(javascript|data):/;

describe("sanitisation", () => {
  it("drops script elements and their contents", () => {
    const { container } = render(
      <Markdown>{"Before.\n\n<script>alert(1)</script>\n\nAfter."}</Markdown>
    );
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("alert(1)");
  });

  it("strips event-handler attributes from raw HTML", () => {
    const { container } = render(
      <Markdown>
        {
          '<img src="shot.png" onerror="alert(1)" onload="alert(2)" alt="probe">'
        }
      </Markdown>
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("onerror")).toBeNull();
    expect(img?.getAttribute("onload")).toBeNull();
  });

  it("refuses javascript: and data: hrefs", () => {
    const { container } = render(
      <Markdown>
        {
          '<a href="javascript:alert(1)">one</a> [two](javascript:alert(2)) <a href="data:text/html,x">three</a>'
        }
      </Markdown>
    );
    for (const anchor of container.querySelectorAll("a")) {
      expect(anchor.getAttribute("href") ?? "").not.toMatch(
        EXECUTABLE_SCHEME_RE
      );
    }
    expect(container.textContent).toContain("one");
  });

  it("keeps the allowlisted raw HTML the schema widens for", () => {
    const { container } = render(
      <Markdown>
        {
          '<b>bold</b>\n\n<details><summary>More</summary>\n\nHidden.\n\n</details>\n\n<iframe src="https://example.invalid"></iframe>'
        }
      </Markdown>
    );
    expect(container.querySelector("b")).not.toBeNull();
    expect(container.querySelector("details")).not.toBeNull();
    expect(container.querySelector("summary")).not.toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });
});

describe("host seams", () => {
  it("cancels link clicks and hands the href to openExternal", () => {
    const openExternal = vi.fn();
    render(
      <Markdown openExternal={openExternal}>
        {"[docs](https://example.invalid/docs)"}
      </Markdown>
    );
    const defaultPrevented = !fireEvent.click(screen.getByText("docs"));
    expect(defaultPrevented).toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://example.invalid/docs");
  });

  it("cancels the click even with no host handler", () => {
    render(<Markdown>{"[docs](https://example.invalid/docs)"}</Markdown>);
    expect(fireEvent.click(screen.getByText("docs"))).toBe(false);
  });

  it("gives repeated suggestion lines distinct keys", () => {
    const errors = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { container } = render(
      <Markdown>{"```suggestion\n  }\n\n  }\n\n```"}</Markdown>
    );
    expect(container.querySelectorAll(".md-suggestion-line")).toHaveLength(4);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("renders nothing for an empty body", () => {
    const { container } = render(<Markdown>{""}</Markdown>);
    expect(container.innerHTML).toBe("");
  });
});

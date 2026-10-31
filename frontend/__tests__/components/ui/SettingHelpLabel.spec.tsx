import { cleanup, fireEvent, render } from "@solidjs/testing-library";
import { afterEach, describe, expect, it } from "vitest";

import { SettingHelpLabel } from "../../../src/ts/components/ui/SettingHelpLabel";

afterEach(cleanup);

describe("setting help in a scrolling dialog", () => {
  const help = "Learn shows English, Vietnamese and IPA.";
  const mount = (): ReturnType<typeof render> =>
    render(() => (
      <dialog open>
        <div data-scroll-pane style={{ overflow: "hidden" }}>
          <SettingHelpLabel label="learning mode" help={help} />
        </div>
      </dialog>
    ));

  it("places the complete description outside the clipped pane and connects it to the trigger", () => {
    const view = mount();
    const trigger = view.getByRole("button", {
      name: "Help for learning mode",
    });
    fireEvent.mouseEnter(trigger);
    const tooltip = view.getByRole("tooltip");
    expect(tooltip.textContent).toBe(help);
    expect(tooltip.closest("dialog")).not.toBeNull();
    expect(tooltip.closest("[data-scroll-pane]")).toBeNull();
    expect(trigger.getAttribute("aria-describedby")).toBe(tooltip.id);

    fireEvent.scroll(
      view.container.querySelector("[data-scroll-pane]") as Element,
    );
    expect(view.queryByRole("tooltip")).toBeNull();
    expect(trigger.hasAttribute("aria-describedby")).toBe(false);
  });

  it("supports keyboard focus and dismisses help with Escape without closing the dialog", () => {
    const view = mount();
    const trigger = view.getByRole("button", {
      name: "Help for learning mode",
    });
    fireEvent.focus(trigger);
    expect(view.getByRole("tooltip")).not.toBeNull();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(view.queryByRole("tooltip")).toBeNull();
    expect(view.container.querySelector("dialog")?.open).toBe(true);
    fireEvent.blur(trigger);
    fireEvent.focus(trigger);
    expect(view.getByRole("tooltip")).not.toBeNull();
    fireEvent.blur(trigger);
    expect(view.queryByRole("tooltip")).toBeNull();
  });

  it("dismisses a visible description when the viewport resizes", () => {
    const view = mount();
    fireEvent.mouseEnter(
      view.getByRole("button", { name: "Help for learning mode" }),
    );
    expect(view.getByRole("tooltip")).not.toBeNull();
    fireEvent(window, new Event("resize"));
    expect(view.queryByRole("tooltip")).toBeNull();
  });
});

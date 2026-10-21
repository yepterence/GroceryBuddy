import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Banner, { BannerType } from "./Banner";

const TYPES: [BannerType, "alert" | "status"][] = [
  ["error", "alert"],
  ["warning", "alert"],
  ["info", "status"],
  ["success", "status"],
];

describe("Banner", () => {
  it.each(TYPES)("shows a %s message with role %s", (type, role) => {
    render(<Banner type={type} message="Something happened" />);
    expect(screen.getByRole(role)).toHaveTextContent("Something happened");
  });

  it.each(TYPES)("styles a %s banner with its own class", (type, role) => {
    render(<Banner type={type} message="x" />);
    expect(screen.getByRole(role)).toHaveClass("banner", `banner-${type}`);
  });

  it("announces errors as alerts but info as a polite status", () => {
    const { rerender } = render(<Banner type="info" message="Saved offline" />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();

    rerender(<Banner type="error" message="Save failed" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each([null, undefined, ""])("renders nothing for %p", (message) => {
    render(<Banner type="error" message={message} />);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("has no dismiss button unless onDismiss is given", () => {
    render(<Banner type="error" message="boom" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each(TYPES)("labels the %s dismiss button with its type", async (type) => {
    const onDismiss = vi.fn();
    render(<Banner type={type} message="boom" onDismiss={onDismiss} />);

    await userEvent.setup().click(screen.getByRole("button", { name: `Dismiss ${type}` }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

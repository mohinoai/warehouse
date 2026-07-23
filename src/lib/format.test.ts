import { describe, expect, it } from "vitest";
import { greetingForHour } from "./format";

describe("greetingForHour", () => {
  it.each([
    [0, "Selamat malam"],
    [4, "Selamat malam"],
    [5, "Selamat pagi"],
    [10, "Selamat pagi"],
    [11, "Selamat siang"],
    [14, "Selamat siang"],
    [15, "Selamat sore"],
    [17, "Selamat sore"],
    [18, "Selamat malam"],
    [23, "Selamat malam"],
  ])("returns the expected greeting at %i:00", (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected);
  });
});

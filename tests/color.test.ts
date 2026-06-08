/// <reference path="../types/bun-test-shim.d.ts" />
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { bold, cyan, isColorEnabled } from "../src/color";

describe("color utilities", () => {
  const origNoColor = process.env.NO_COLOR;
  const origForceColor = process.env.FORCE_COLOR;
  const origIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    // @ts-ignore
    process.stdout.isTTY = true;
  });

  afterEach(() => {
    if (origNoColor === undefined) {
      delete process.env.NO_COLOR;
    } else {
      process.env.NO_COLOR = origNoColor;
    }
    if (origForceColor === undefined) {
      delete process.env.FORCE_COLOR;
    } else {
      process.env.FORCE_COLOR = origForceColor;
    }
    // @ts-ignore
    process.stdout.isTTY = origIsTTY;
  });

  describe("isColorEnabled", () => {
    it("returns true when stdout is TTY and no disabling env vars are set", () => {
      expect(isColorEnabled()).toBe(true);
    });

    it("returns false when NO_COLOR is set", () => {
      process.env.NO_COLOR = "1";
      expect(isColorEnabled()).toBe(false);
    });

    it("returns false when stdout is not a TTY", () => {
      // @ts-ignore
      process.stdout.isTTY = false;
      expect(isColorEnabled()).toBe(false);
    });

    it("returns true when FORCE_COLOR is set even if NO_COLOR is set", () => {
      process.env.NO_COLOR = "1";
      process.env.FORCE_COLOR = "1";
      expect(isColorEnabled()).toBe(true);
    });

    it("returns true when FORCE_COLOR is set even if stdout is not a TTY", () => {
      // @ts-ignore
      process.stdout.isTTY = false;
      process.env.FORCE_COLOR = "1";
      expect(isColorEnabled()).toBe(true);
    });

    it("returns false when FORCE_COLOR is 0", () => {
      process.env.FORCE_COLOR = "0";
      expect(isColorEnabled()).toBe(false);
    });
  });

  describe("bold", () => {
    it("wraps text with ANSI bold codes when color is enabled", () => {
      expect(bold("hello")).toBe("\x1b[1mhello\x1b[22m");
    });

    it("returns plain text when color is disabled", () => {
      process.env.NO_COLOR = "1";
      expect(bold("hello")).toBe("hello");
    });

    it("handles numeric input", () => {
      expect(bold(42)).toBe("\x1b[1m42\x1b[22m");
    });
  });

  describe("cyan", () => {
    it("wraps text with ANSI cyan codes when color is enabled", () => {
      expect(cyan("hello")).toBe("\x1b[36mhello\x1b[39m");
    });

    it("returns plain text when color is disabled", () => {
      process.env.NO_COLOR = "1";
      expect(cyan("hello")).toBe("hello");
    });

    it("handles numeric input", () => {
      expect(cyan(42)).toBe("\x1b[36m42\x1b[39m");
    });
  });
});

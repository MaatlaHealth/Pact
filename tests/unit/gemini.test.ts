import { describe, it, expect } from "vitest";
import { parseJsonLoose } from "@/lib/gemini/client";

describe("model output parsing", () => {
  it("accepts plain JSON, fenced JSON, and JSON with surrounding prose", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonLoose('```json\n{"a":1}\n```')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJsonLoose('Here you go: {"a":{"b":2}} thanks')).toEqual({ ok: true, value: { a: { b: 2 } } });
  });

  it("rejects invalid output", () => {
    expect(parseJsonLoose("nothing here")).toEqual({ ok: false });
    expect(parseJsonLoose("{broken")).toEqual({ ok: false });
  });
});

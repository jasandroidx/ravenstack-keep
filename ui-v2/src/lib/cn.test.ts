import { describe, it } from "node:test";
import assert from "node:assert";
import { cn } from "./cn.ts";

describe("cn utility", () => {
  it("should merge simple class names", () => {
    assert.strictEqual(cn("foo", "bar"), "foo bar");
  });

  it("should handle conditional class names via clsx", () => {
    const isBarActive = false;
    const isBazActive = true;
    assert.strictEqual(
      cn("foo", isBarActive && "bar", isBazActive && "baz", null, undefined),
      "foo baz"
    );
  });

  it("should handle object and array inputs", () => {
    assert.strictEqual(
      cn({ foo: true, bar: false }, ["baz", { qux: true }]),
      "foo baz qux"
    );
  });

  it("should correctly resolve conflicting Tailwind classes using twMerge", () => {
    assert.strictEqual(cn("p-4", "p-2"), "p-2");
    assert.strictEqual(cn("bg-red-500", "bg-blue-500"), "bg-blue-500");
    assert.strictEqual(
      cn("text-red-500 hover:text-blue-500", "text-green-500"),
      "hover:text-blue-500 text-green-500"
    );
  });

  it("should return empty string when no arguments or falsy arguments are passed", () => {
    assert.strictEqual(cn(), "");
    assert.strictEqual(cn(null, undefined, false), "");
  });
});

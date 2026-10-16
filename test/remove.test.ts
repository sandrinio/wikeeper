import { describe, expect, it } from "vitest";
import { GITIGNORE_BLOCK_END, GITIGNORE_BLOCK_START, stripManagedBlock } from "../src/core/gitignore.js";
import { CONFIRM_WORD } from "../src/commands/remove.js";

describe("remove helpers", () => {
  it("uses the documented confirmation word", () => {
    expect(CONFIRM_WORD).toBe("wikeeper");
  });
  it("strips a block whose END line has no trailing newline", () => {
    const t = `a\n${GITIGNORE_BLOCK_START}\nx\n${GITIGNORE_BLOCK_END}`;
    expect(stripManagedBlock(t)).toEqual({ text: "a\n", status: "stripped" });
  });
  it("strips a top-inserted CRLF block and restores the user bytes", () => {
    const t = `${GITIGNORE_BLOCK_START}\r\na\r\n${GITIGNORE_BLOCK_END}\r\nnode_modules\r\n*.log`;
    expect(stripManagedBlock(t)).toEqual({ text: "node_modules\r\n*.log", status: "stripped" });
  });
});

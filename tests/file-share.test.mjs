import assert from "node:assert/strict";
import { test } from "node:test";
import { shareOrDownloadFile } from "../src/lib/file-share.ts";

test("downloads when a browser advertises sharing but denies the chooser", async () => {
  const originalNavigator = globalThis.navigator;
  const originalDocument = globalThis.document;
  const originalFile = globalThis.File;
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  let downloaded = false;
  let revoked = false;

  try {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        canShare: () => true,
        share: async () => {
          const error = new Error("Permission denied");
          error.name = "NotAllowedError";
          throw error;
        },
      },
    });
    globalThis.File ??= class File extends Blob {
      constructor(parts, name, options) {
        super(parts, options);
        this.name = name;
      }
    };
    globalThis.document = {
      body: { appendChild: () => {} },
      createElement: () => ({ click: () => { downloaded = true; }, remove: () => {} }),
    };
    URL.createObjectURL = () => "blob:test";
    URL.revokeObjectURL = () => { revoked = true; };

    const result = await shareOrDownloadFile("report.md", "text/markdown", "selected data");
    assert.equal(result, "downloaded");
    assert.equal(downloaded, true);
    assert.equal(revoked, true);
  } finally {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: originalNavigator });
    globalThis.document = originalDocument;
    globalThis.File = originalFile;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  }
});

/**
 * Copyright 2020 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as m from "./index";
import type { ToCallback, FromCallback } from "./index";
import fs from "fs-extra";
import path from "path";
import tmp, { DirResult } from "tmp";
import { Context } from "semantic-release";
import { test, vi, expect, beforeEach, afterEach } from "vitest";

import { prepare } from "./index";

const context: Context = {
  lastRelease: {
    gitHead: "foo",
    gitTag: "v1.0.0",
    version: "1.0.0",
  },
  nextRelease: {
    type: "major" as const,
    gitTag: "2.0.0",
    version: "2.0.0",
    notes: "",
    gitHead: "foo",
  },
  logger: {
    log: vi.fn(),
    error: console.error,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any,
  env: {},
};

let d: DirResult;

beforeEach(() => {
  d = tmp.dirSync({ unsafeCleanup: true });
  fs.copySync("fixtures", d.name);
});

afterEach(() => {
  d.removeCallback();
});

async function assertFileContents(
  name: string,
  expected: string
): Promise<void> {
  const actual = await fs.readFileSync(path.join(d.name, name), "utf-8");
  expect(actual).toEqual(expected);
}

async function assertFileContentsContain(
  name: string,
  expected: string
): Promise<void> {
  const actual = await fs.readFileSync(path.join(d.name, name), "utf-8");
  expect(actual).toEqual(expect.stringContaining(expected));
}

test("should expose prepare", async () => {
  expect(m.prepare).toBeDefined();
});

test("prepare should replace using regex", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/*.py")],
      from: '__VERSION__ = ".*"',
      to: '__VERSION__ = "${nextRelease.version}"',
    },
    {
      files: [path.join(d.name, "/build.gradle")],
      from: "version = '.*'",
      to: "version = '${nextRelease.version}'",
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain(
    "__init__.py",
    `__VERSION__ = "${context.nextRelease?.version}"`
  );
  await assertFileContents(
    "build.gradle",
    `version = '${context.nextRelease?.version}'`
  );
});

test("prepare should use result check", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/*.py")],
      from: '__VERSION__ = "1.0.0"',
      to: '__VERSION__ = "${nextRelease.version}"',
      results: [
        {
          file: path.join(d.name, "/__init__.py"),
          hasChanged: true,
          numMatches: 1,
          numReplacements: 1,
        },
      ],
      countMatches: true,
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain(
    "__init__.py",
    `__VERSION__ = "${context.nextRelease?.version}"`
  );
});

test("prepare should throw error if result mismatch", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/*")],
      from: '__VERSION__ = "1.0.0"',
      to: '__VERSION__ = "${nextRelease.version}"',
      results: [],
      countMatches: true,
    },
  ];
  await expect(prepare({ replacements }, context)).rejects.toThrow();
});

test("prepare should use result check", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/*.py")],
      from: '__VERSION__ = "1.0.0"',
      to: '__VERSION__ = "${nextRelease.version}"',
      results: [
        {
          file: path.join(d.name, "/__init__.py"),
          hasChanged: true,
          numMatches: 1,
          numReplacements: 1,
        },
      ],
      countMatches: true,
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain(
    "__init__.py",
    `__VERSION__ = "${context.nextRelease?.version}"`
  );
});

test("replacements are global", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/*.md")],
      from: "foo@.*",
      to: 'foo@"${nextRelease.version}"',
      results: [
        {
          file: path.join(d.name, "/foo.md"),
          hasChanged: true,
          numMatches: 2,
          numReplacements: 2,
        },
      ],
      countMatches: true,
    },
  ];

  await prepare({ replacements }, context);

  // Will throw if results do not match
});

test("prepare should replace using function", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/*.py")],
      from: '__VERSION__ = ".*"',
      to: () => `__VERSION__ = 2`,
    },
    {
      files: [path.join(d.name, "/build.gradle")],
      from: "version = '.*'",
      to: () => "version = 2",
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain("__init__.py", `__VERSION__ = 2`);
  await assertFileContents("build.gradle", "version = 2");
});

test("prepare accepts regular expressions for `from`", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/foo.md")],
      from: /yarn(.+?)@.*/g,
      to: `yarn add foo@${context.nextRelease?.version}`,
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain("foo.md", "npm i foo@1.0.0");
  await assertFileContentsContain("foo.md", "yarn add foo@2.0.0");
});

test("prepare accepts callback functions for `from`", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/foo.md")],
      from: (filename: string) => `${path.basename(filename, ".md")}@1.0.0`, // Equivalent to "foo@1.0.0"
      to: `foo@${context.nextRelease?.version}`,
    },
  ];

  await prepare({ replacements }, context);

  // As `from` ended up being a string after executing the function, only the
  // first occurrence of `foo@1.0.0` in the file should have been replaced.
  // Note that this is different behavior from the case where a string is
  // passed directly to `from` (which the plugin implicitly turns into a global
  // regular expression)
  await assertFileContentsContain("foo.md", "npm i foo@2.0.0");
  await assertFileContentsContain("foo.md", "yarn add foo@1.0.0");
});

test("prepare accepts multi-argument `to` callback functions for regular expression `from`", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/foo.md")],
      from: /npm i (.+)@(.+)`/g,
      to: ((match: string, packageName: string, version: string) => {
        return match
          .replace(version, context.nextRelease?.version ?? version)
          .replace(packageName, packageName.split("").reverse().join(""));
      }) as ToCallback,
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain("foo.md", "npm i oof@2.0.0");
  await assertFileContentsContain("foo.md", "yarn add foo@1.0.0");
});

test("prepare passes the `context` as the final function argument to `from` callbacks", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/foo.md")],
      // Returns a regular expression matching the previous version, so that
      // _all_ occurrences in the document are updated
      from: ((_: string, context: Context) =>
        new RegExp(context?.lastRelease?.version || "", "g")) as FromCallback,
      to: "3.0.0",
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain("foo.md", "npm i foo@3.0.0");
  await assertFileContentsContain("foo.md", "yarn add foo@3.0.0");
});

test("prepare passes the `context` as the final function argument to `to` callbacks", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/foo.md")],
      from: /npm i (.*)@(.*)`/,
      to: ((_: string, package_name: string, ...args: unknown[]) => {
        const reversed_package_name = package_name.split("").reverse().join("");
        const context = args.pop() as Context;

        return `npm i ${reversed_package_name}@${context?.nextRelease?.version}`;
      }) as ToCallback,
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain(
    "foo.md",
    `npm i oof@${context.nextRelease?.version}`
  );
  await assertFileContentsContain("foo.md", "yarn add foo@1.0.0");
});

test("prepare accepts an array of `from` matchers", async () => {
  const replacements = [
    {
      files: [path.join(d.name, "/foo.md")],
      // Similarly to single string values, strings in arrays should be taken
      // to mean global replacements for improved JSON configuration
      // capabilities. The regular expression and function matchers should only
      // replace a single occurrence and hence only affect the `npm` line
      from: [
        "1.0.0",
        /install with/,
        (filename: string) => path.basename(filename, ".md"),
      ],
      to: "bar",
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain("foo.md", "bar `npm i bar@bar`");
  await assertFileContentsContain("foo.md", "install with `yarn add foo@bar`");
});

test("prepare accepts an array of `to` replacements", async () => {
  // This replaces `npm i` with `npm install` and all occurrences of `1.0.0`
  // with the `version` of the `nextRelease` as string `from` matchers are
  // turned into global regular expressions
  const replacements = [
    {
      files: [path.join(d.name, "/foo.md")],
      from: ["npm i", "1.0.0"],
      to: [
        "npm install",
        (...args: unknown[]) => {
          const context = args.pop() as Context;
          return context?.nextRelease?.version || "";
        },
      ],
    },
  ];

  await prepare({ replacements }, context);

  await assertFileContentsContain(
    "foo.md",
    `npm install foo@${context.nextRelease?.version}`
  );
  await assertFileContentsContain(
    "foo.md",
    `yarn add foo@${context.nextRelease?.version}`
  );
});

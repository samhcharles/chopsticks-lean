/**
 * MAP Cycle 5 — Music Embed Migration Tests
 * Verifies that music.js buildTrackEmbed uses musicNowPlaying component.
 */

import { describe, it } from "mocha";
import { strict as assert } from "assert";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const musicSrc = readFileSync(join(__dirname, "../../src/commands/music.js"), "utf8");

describe("MAP-C5 — music.js embed component migration", function () {
  it("imports musicNowPlaying from embedComponents.js", function () {
    assert.ok(
      musicSrc.includes("musicNowPlaying") && musicSrc.includes("embedComponents.js"),
      "music.js must import musicNowPlaying from embedComponents.js"
    );
  });

  it("buildTrackEmbed uses musicNowPlaying for 'playing' action", function () {
    const buildIdx = musicSrc.indexOf("function buildTrackEmbed(");
    assert.notEqual(buildIdx, -1, "buildTrackEmbed function must exist");
    const fn = musicSrc.slice(buildIdx, buildIdx + 1500);
    assert.ok(fn.includes("musicNowPlaying"), "buildTrackEmbed must call musicNowPlaying for 'playing'");
    assert.ok(fn.includes(`action === "playing"`), "must branch on action === 'playing'");
  });

  it("'playing' path passes duration to musicNowPlaying", function () {
    const buildIdx = musicSrc.indexOf("function buildTrackEmbed(");
    const fn = musicSrc.slice(buildIdx, buildIdx + 1500);
    assert.ok(fn.includes("duration"), "must pass duration to musicNowPlaying");
  });

  it("'playing' path passes requestedBy to musicNowPlaying", function () {
    const buildIdx = musicSrc.indexOf("function buildTrackEmbed(");
    const fn = musicSrc.slice(buildIdx, buildIdx + 1500);
    assert.ok(fn.includes("requestedBy"), "must pass requestedBy to musicNowPlaying");
  });

  it("'queued' path still uses makeEmbed (not musicNowPlaying)", function () {
    const buildIdx = musicSrc.indexOf("function buildTrackEmbed(");
    const fn = musicSrc.slice(buildIdx, buildIdx + 1500);
    assert.ok(fn.includes("makeEmbed"), "queued path must still use makeEmbed");
    assert.ok(fn.includes('"Queued"'), "queued path must use 'Queued' title");
  });

  it("music.js meta.category is 'music'", function () {
    assert.ok(musicSrc.includes('category: "music"') || musicSrc.includes("category: 'music'"), "meta.category must be music");
  });
});

// ── Runtime import sanity ─────────────────────────────────────────────────────

describe("MAP-C5 — music.js module loads", function () {
  it("exports data, execute, meta without errors", async function () {
    const mod = await import("../../src/commands/music.js");
    assert.ok(mod.data && typeof mod.data.toJSON === "function", "data must be SlashCommandBuilder");
    assert.ok(typeof mod.execute === "function", "execute must be a function");
    assert.ok(mod.meta && typeof mod.meta === "object", "meta must be object");
  });

  it("command name is 'music'", async function () {
    const { data } = await import("../../src/commands/music.js");
    assert.equal(data.toJSON().name, "music");
  });
});

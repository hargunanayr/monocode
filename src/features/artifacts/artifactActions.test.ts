import { describe, expect, it } from "vitest";
import {
  ARTIFACT_MESSAGE_MAX_CHARS,
  parseSendToMono,
  resolveArtifactMono,
} from "./artifactActions";

const monos = [
  { id: "m-1", name: "Dianah", mascot: "cat", color: "#fff" },
  { id: "m-2", name: "Karin", mascot: "fox", color: "#000" },
];

describe("a page's request to send a Mono a message", () => {
  it("keeps the request id, the named Mono and the trimmed message", () => {
    expect(
      parseSendToMono({ id: 3, mono: " Karin ", message: "Fix it\r\nnow " }),
    ).toEqual({ requestId: 3, mono: "Karin", message: "Fix it\nnow" });
  });

  it("refuses requests it cannot answer, and answers the rest with why", () => {
    expect(parseSendToMono({ id: "3", mono: "Karin", message: "x" })).toEqual({
      error: "Invalid request",
    });
    expect(parseSendToMono({ id: 4, message: "x" })).toMatchObject({
      requestId: 4,
      error: "Name the Mono to send to",
    });
    expect(
      parseSendToMono({ id: 5, mono: "Karin", message: "  " }),
    ).toMatchObject({ requestId: 5 });
    expect(
      parseSendToMono({
        id: 6,
        mono: "Karin",
        message: "x".repeat(ARTIFACT_MESSAGE_MAX_CHARS + 1),
      }),
    ).toHaveProperty("error");
  });

  it("finds the Mono by id or by name, ignoring case", () => {
    expect(resolveArtifactMono(monos, "m-2")).toBe(monos[1]);
    expect(resolveArtifactMono(monos, "karin")).toBe(monos[1]);
    expect(resolveArtifactMono(monos, "Kenzo")).toEqual({
      error: "No Mono is named Kenzo. Monos: Dianah, Karin",
    });
    expect(
      resolveArtifactMono([...monos, { ...monos[1], id: "m-3" }], "Karin"),
    ).toEqual({ error: "Several Monos are named Karin" });
  });
});

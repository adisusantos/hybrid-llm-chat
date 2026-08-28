import { describe, it, expect } from "vitest";
import { extractDialogue } from "../lib/tts/extract-dialogue";

describe("extractDialogue", () => {
  it("extracts dialogue inside double quotes with asterisk narration", () => {
    const input = '*dia sedang berdiri menyilangkan tangan* "apa yang kamu maksud? coba ulangi sekali lagi?".';
    expect(extractDialogue(input)).toBe("apa yang kamu maksud? coba ulangi sekali lagi?");
  });

  it("extracts dialogue without quotes when only asterisk narration exists", () => {
    const input = "*dia sedang berdiri menyilangkan tangan* apa yang kamu maksud? coba ulangi sekali lagi?.";
    expect(extractDialogue(input)).toBe("apa yang kamu maksud? coba ulangi sekali lagi?.");
  });

  it("extracts dialogue with contractions inside double quotes", () => {
    const input = '*dia tersenyum* "Don\'t worry, it\'s going to be fine."';
    expect(extractDialogue(input)).toBe("Don't worry, it's going to be fine.");
  });

  it("extracts dialogue inside quotes when narration has no asterisks", () => {
    const input = 'dia sedang berdiri menyilangkan tangan "apa yang kamu maksud? coba ulangi sekali lagi?".';
    expect(extractDialogue(input)).toBe("apa yang kamu maksud? coba ulangi sekali lagi?");
  });

  it("handles multiple quoted dialogues in one response", () => {
    const input = '*tersenyum* "Halo kawan!" *duduk di kursi* "Ada yang bisa kubantu?"';
    expect(extractDialogue(input)).toBe("Halo kawan! Ada yang bisa kubantu?");
  });

  it("handles curly smart quotes", () => {
    const input = 'Dia berkata, “Selamat pagi!” dengan gembira.';
    expect(extractDialogue(input)).toBe("Selamat pagi!");
  });

  it("handles parenthetical action fallback", () => {
    const input = "(dia mengangguk) Baiklah kalau begitu.";
    expect(extractDialogue(input)).toBe("Baiklah kalau begitu.");
  });

  it("returns raw text stripped of asterisks when message is only narration", () => {
    const input = "*dia hanya mengangguk tanpa bicara*";
    expect(extractDialogue(input)).toBe("dia hanya mengangguk tanpa bicara");
  });
});

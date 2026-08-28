import { describe, it, expect } from "vitest";
import { extractDialogue } from "../lib/tts/extract-dialogue";

describe("extractDialogue with real character responses", () => {
  it("handles Ling Mei Wong Message 1 (asterisk action + plain dialogue + [Image:...])", () => {
    const input = `*Laughs and nods, stepping inside and turning to face Young Man with a smile.* Alright, suit yourself. But don't think you can just stand out here all night - you've got to get some rest so we can do this again sometime soon.

[Image: Ling Mei Wong stands in the open doorway of her apartment...]`;

    const result = extractDialogue(input);
    expect(result).toBe("Alright, suit yourself. But don't think you can just stand out here all night - you've got to get some rest so we can do this again sometime soon.");
  });

  it("handles Alejandra Message 2 (mixed asterisk actions + dialogue without quotes + contractions don't/it's)", () => {
    const input = `*turning to face you with a polite smile* Oh, yes, heading home from downtown, *she replied, lightly adjusting her handbag on her lap.* It's been a long day, but the commute's not too bad. How about you? *Her gaze was curious, but not intrusive, as she waited for you to share.*`;

    const result = extractDialogue(input);
    expect(result).toBe("Oh, yes, heading home from downtown. It's been a long day, but the commute's not too bad. How about you?");
  });

  it("handles Alejandra Message 1 (asterisk action + quoted dialogue with contractions + [image:...])", () => {
    const input = `*Turning her head slightly with a soft smile, Alejandra Elena Rodriguez nods.* "Yes, just finishing up my shift downtown. Commuting can be a bit of a slog, especially this time of evening when the streets are so crowded." *She adjusts her handbag on her lap, the patterned fabric of her blouse catching the light as she shifts slightly in her seat.* "But at least I have some good reading material to pass the time," *she adds, patting the paperback novel peeking out of her bag.*

[image: Alejandra Elena Rodriguez sits in the crowded train car...]`;

    const result = extractDialogue(input);
    expect(result).toBe("Yes, just finishing up my shift downtown. Commuting can be a bit of a slog, especially this time of evening when the streets are so crowded. But at least I have some good reading material to pass the time,");
  });
});

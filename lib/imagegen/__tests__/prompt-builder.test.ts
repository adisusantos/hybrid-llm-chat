import { describe, expect, it } from "vitest";
import { buildSmartPrompt, inferCameraAngle, inferShotType } from "@/lib/imagegen/prompt-builder";

describe("buildSmartPrompt gender and age handling", () => {
  it("keeps a legacy child character male and omits adult body attributes", () => {
    const fields = buildSmartPrompt({
      appearance: "Max is a chubby boy with a round face. He looks like a typical 7-year-old boy.",
      faceDescription: JSON.stringify({
        face_shape: "round, slightly chubby cheeks",
        age_range: "5-7 years old",
        hair: "short, dark brown, straight",
      }),
      bodyDescription: JSON.stringify({
        body_build: "chubby",
        bust: "medium",
        waist: "full",
        hip_width: "wide",
        body_proportions: "apple",
      }),
      characterGender: null,
      lastAssistantMsg: "He runs across the field in shorts and a t-shirt.",
    });

    expect(fields.subject).toMatch(/^boy\b/i);
    expect(fields.subject).toContain("chubby");
    expect(fields.subject).not.toMatch(/\b(woman|girl|medium|full|wide|apple)\b/i);
  });

  it("uses gender detected by avatar analysis before appearance inference", () => {
    const fields = buildSmartPrompt({
      appearance: "A young character with a round face.",
      faceDescription: JSON.stringify({
        age_range: "8 years old",
        gender: "female",
        face_shape: "round",
      }),
      lastAssistantMsg: "The character stands by a window.",
    });

    expect(fields.subject).toMatch(/^girl\b/i);
    expect(fields.subject).not.toMatch(/^boy\b/i);
  });

  it("does not default unknown adult gender to woman", () => {
    const fields = buildSmartPrompt({
      appearance: "A person with an oval face.",
      faceDescription: JSON.stringify({ age_range: "mid 30s", face_shape: "oval" }),
      lastAssistantMsg: "The person is standing outdoors.",
    });

    expect(fields.subject).toMatch(/^adult person\b/i);
    expect(fields.subject).not.toMatch(/^adult woman\b/i);
  });

  it("keeps a 12-year-old preteen from being categorized as a teenager", () => {
    const fields = buildSmartPrompt({
      appearance: "Khanh is a lean boy. He is of average height for a 12-year-old, just shy of five feet tall.",
      faceDescription: JSON.stringify({
        age_range: "early teens, pre-teen",
        gender: "male",
        face_shape: "oval",
      }),
      bodyDescription: JSON.stringify({
        body_build: "lean",
        bust: null,
        waist: "moderate",
        hip_width: "moderate",
        body_proportions: "rectangular",
      }),
      characterGender: null,
      lastAssistantMsg: "He walks through the park.",
    });

    expect(fields.subject).toMatch(/^boy, 12-year-old\b/i);
    expect(fields.subject).not.toMatch(/teenage/i);
  });
});

// ---------------------------------------------------------------------------
// inferCameraAngle
// ---------------------------------------------------------------------------

describe("inferCameraAngle", () => {
  it("returns low angle when subject is on top of something", () => {
    expect(inferCameraAngle("*She hides on top of the wardrobe, holding her breath.*")).toBe("low angle");
  });

  it("returns low angle for Indonesian 'diatas lemari'", () => {
    expect(inferCameraAngle("*Aku bersembunyi di atas lemari, menahan napas.*")).toBe("low angle");
  });

  it("returns low angle for rooftop/climbing", () => {
    expect(inferCameraAngle("*He climbs up the tree and looks down.*")).toBe("low angle");
  });

  it("returns low angle for towering/looming", () => {
    expect(inferCameraAngle("*She towers over you, arms crossed.*")).toBe("low angle");
  });

  it("returns worm's eye view for flying/floating", () => {
    expect(inferCameraAngle("*She floats in mid-air, glowing softly.*")).toBe("worm's eye view");
  });

  it("returns high angle for kneeling/crouching", () => {
    expect(inferCameraAngle("*She kneels beside you, looking up.*")).toBe("high angle");
  });

  it("returns high angle for lying on the floor", () => {
    expect(inferCameraAngle("*He's lying on the floor, exhausted.*")).toBe("high angle");
  });

  it("returns high angle for crawling", () => {
    expect(inferCameraAngle("*She crawls under the desk to hide.*")).toBe("high angle");
  });

  it("returns bird's eye view for explicit 'from above'", () => {
    expect(inferCameraAngle("*Viewed from above, the garden stretches out.*")).toBe("bird's eye view");
  });

  it("returns dutch angle for dizzy/disoriented", () => {
    expect(inferCameraAngle("*Everything spins as she stumbles, dizzy from the blow.*")).toBe("dutch angle");
  });

  it("returns back view for walking away", () => {
    expect(inferCameraAngle("*She turns her back and walks away without a word.*")).toBe("back view");
  });

  it("returns side view for profile", () => {
    expect(inferCameraAngle("*Her profile is silhouette against the sunset.*")).toBe("side view");
  });

  it("returns over-the-shoulder for peeking over shoulder", () => {
    expect(inferCameraAngle("*She peeks over your shoulder at the screen.*")).toBe("over-the-shoulder");
  });

  it("returns eye level + close-up for whispering", () => {
    expect(inferCameraAngle("*She leans close and whispers in your ear.*")).toBe("eye level");
  });

  it("returns eye level for default/neutral scene", () => {
    expect(inferCameraAngle("*She smiles at you from across the table.*")).toBe("eye level");
  });

  it("returns eye level for plain dialog-only message", () => {
    expect(inferCameraAngle('"Good morning," she says.')).toBe("eye level");
  });
});

// ---------------------------------------------------------------------------
// inferShotType
// ---------------------------------------------------------------------------

describe("inferShotType", () => {
  it("returns close-up for whispering scene", () => {
    expect(inferShotType("*She whispers softly, her face inches from yours.*")).toBe("close-up");
  });

  it("returns close-up for staring into eyes", () => {
    expect(inferShotType("*She stares into your eyes, unblinking.*")).toBe("close-up");
  });

  it("returns establishing shot for wide/panoramic", () => {
    expect(inferShotType("*A wide shot of the mountain landscape.*")).toBe("establishing shot");
  });

  it("returns full body shot for explicit full body", () => {
    expect(inferShotType("*She stands there, head to toe in her new outfit.*")).toBe("full body shot");
  });

  it("returns medium shot for upper body / waist up", () => {
    expect(inferShotType("*From the waist up, she looks elegant.*")).toBe("medium shot");
  });

  it("returns default full body shot for neutral scene", () => {
    expect(inferShotType("*She walks down the hallway.*")).toBe("full body shot");
  });
});

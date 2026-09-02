import { describe, it, expect } from "vitest";
import { buildCharacterSystemPrompt, buildCharacterDetailBlock } from "../lib/llama/prompt-builder";
import { parseCharacterJSON } from "../lib/characters/generate";
import { buildHeuristicPrompt, buildSmartPrompt } from "../lib/imagegen/prompt-builder";
import { ChatBundleSchema } from "../lib/bundle/import";

describe("Phase 2: System Prompt Injection", () => {
  const baseChar = {
    name: "Ken Arok",
    description: "Pendiri Kerajaan Singasari",
    personality: "Ambisious, berani, tak kenal takut",
    scenario: "Pertemuan di tepi hutan Tumapel",
    appearance: "Tubuh tegap, kulit sawo matang, memakai kain jarik",
    firstMes: '*menatap tajam* "Siapa kau yang berani masuk wilayahku?"',
    mesExample: '{{user}}: Aku pengelana\n{{char}}: *terkekeh* "Pengelana katamu?"',
    systemPromptOverride: null,
    postHistoryInstructions: "Gunakan bahasa Indonesia baku",
  };

  it("buildCharacterSystemPrompt() includes [World Setting] block when worldSetting is provided", () => {
    const char = {
      ...baseChar,
      worldSetting: "Jawa kuno abad 13, era Kerajaan Tumapel/Singasari. Teknologi: keris, tombak, gerobak kayu. Pakaian: kain tenun, jarik, kemben. Transportasi: kuda, jalan kaki.",
    };

    const prompt = buildCharacterSystemPrompt(char);

    expect(prompt).toContain("[World Setting]");
    expect(prompt).toContain("Jawa kuno abad 13");
    expect(prompt).toContain("NEVER reference objects, technology, clothing, transportation, architecture, or customs");
    expect(prompt).toContain("[Response style]");

    // Verify ordering: [World Setting] should appear before [Response style]
    const worldIndex = prompt.indexOf("[World Setting]");
    const styleIndex = prompt.indexOf("[Response style]");
    expect(worldIndex).toBeLessThan(styleIndex);
  });

  it("buildCharacterSystemPrompt() omits [World Setting] block when worldSetting is empty", () => {
    const char = {
      ...baseChar,
      worldSetting: "",
    };

    const prompt = buildCharacterSystemPrompt(char);

    expect(prompt).not.toContain("[World Setting]");
    expect(prompt).not.toContain("NEVER reference objects");
    expect(prompt).toContain("[Personality]");
    expect(prompt).toContain("[Response style]");
  });

  it("buildCharacterDetailBlock() includes world setting in override templates", () => {
    const char = {
      ...baseChar,
      worldSetting: "Medieval Europe 14th century",
    };

    const detailBlock = buildCharacterDetailBlock(char);

    expect(detailBlock).toContain("[World Setting]");
    expect(detailBlock).toContain("Medieval Europe 14th century");
    expect(detailBlock).toContain("NEVER reference objects");
  });

  it("buildCharacterDetailBlock() omits world setting when empty", () => {
    const char = {
      ...baseChar,
      worldSetting: "",
    };

    const detailBlock = buildCharacterDetailBlock(char);

    expect(detailBlock).not.toContain("[World Setting]");
  });

  it("buildCharacterSystemPrompt() injects world setting into systemPromptOverride", () => {
    const char = {
      ...baseChar,
      systemPromptOverride: "You are {{char}}.\nEXAMPLE FORMAT\n{{user}}: hi\n{{char}}: hello",
      worldSetting: "Ancient Japan, Edo period",
    };

    const prompt = buildCharacterSystemPrompt(char);

    expect(prompt).toContain("[World Setting]");
    expect(prompt).toContain("Ancient Japan, Edo period");
    expect(prompt).toContain("Ken Arok");
  });
});

describe("Phase 5: Character Generation Parser", () => {
  it("parseCharacterJSON() extracts worldSetting from valid LLM JSON", () => {
    const llmOutput = JSON.stringify({
      name: "Hayasaka",
      description: "A ninja in feudal Japan",
      personality: "Silent, disciplined, loyal",
      appearance: "Wearing dark shinobi shozoku, 170cm tall",
      scenario: "Infiltrating a castle at midnight",
      worldSetting: "Feudal Japan, Sengoku period. Castles made of wood and stone, paper lanterns, swords and shurikens.",
      firstMes: '*drops from the ceiling silently* "Target confirmed."',
      mesExample: '{{user}}: Who are you?\n{{char}}: *vanishes into shadows* "A shadow."',
    });

    const parsed = parseCharacterJSON(llmOutput);

    expect(parsed.success).toBe(true);
    expect(parsed.fields.name).toBe("Hayasaka");
    expect(parsed.fields.worldSetting).toBe(
      "Feudal Japan, Sengoku period. Castles made of wood and stone, paper lanterns, swords and shurikens.",
    );
  });

  it("parseCharacterJSON() handles missing worldSetting gracefully (defaults to empty string)", () => {
    const llmOutput = JSON.stringify({
      name: "Modern Detective",
      description: "A detective in modern Tokyo",
      personality: "Sharp, coffee-addicted",
      appearance: "Suit and tie, messy hair",
      scenario: "Investigating a crime scene",
      firstMes: '*sips coffee* "What do we have here?"',
      mesExample: '{{user}}: Any clues?\n{{char}}: "Just this fingerprint."',
    });

    const parsed = parseCharacterJSON(llmOutput);

    expect(parsed.success).toBe(true);
    expect(parsed.fields.worldSetting).toBe("");
  });

  it("parseCharacterJSON() extracts worldSetting via regex fallback when JSON is malformed", () => {
    const malformedOutput = `Here is your character:
{
  "name": "Thorin",
  "description": "Dwarven warrior",
  "personality": "Proud, stubborn",
  "appearance": "Braided beard, plate armor",
  "scenario": "Guarding the mountain gate",
  "worldSetting": "High fantasy medieval era with magic and mythical creatures",
  "firstMes": "*grips warhammer* \\"Halt!\\"",
  "mesExample": "{{user}}: Let me pass\\n{{char}}: *stands firm* \\"Never!\\""
}`;

    const parsed = parseCharacterJSON(malformedOutput);

    expect(parsed.success).toBe(true);
    expect(parsed.fields.worldSetting).toContain("High fantasy medieval");
  });
});

describe("Phase 6: Image Generation Era Hints", () => {
  it("buildHeuristicPrompt() injects medieval era hints into environment and negative prompt", () => {
    const prompt = buildHeuristicPrompt({
      appearance: "180cm, muscular build, short brown hair, blue eyes",
      lastAssistantMsg: '*walks through the market* "Greetings traveler, what brings you here?"',
      worldSetting: "Medieval Europe, 13th century. Castle town, cobblestone roads, torches.",
    });

    expect(prompt.environment).toContain("medieval architecture");
    expect(prompt.environment).toContain("cobblestone");
    expect(prompt.negativePrompt).toContain("modern buildings");
    expect(prompt.negativePrompt).toContain("car");
  });

  it("buildHeuristicPrompt() injects ancient Japan era hints", () => {
    const prompt = buildHeuristicPrompt({
      appearance: "165cm, slim build, black hair tied in topknot",
      lastAssistantMsg: '*bows respectfully* "Welcome to our village."',
      worldSetting: "Jepang kuno era Sengoku, samurai and traditional villages",
    });

    expect(prompt.environment).toContain("traditional Japanese architecture");
    expect(prompt.negativePrompt).toContain("western clothing");
  });

  it("buildHeuristicPrompt() injects ancient Java era hints", () => {
    const prompt = buildHeuristicPrompt({
      appearance: "170cm, tan skin, wearing batik and keris",
      lastAssistantMsg: '*sits at the pendopo* "Mari duduk bersama."',
      worldSetting: "Kerajaan Jawa kuno, era Majapahit, candi batu dan pendopo kayu",
    });

    expect(prompt.environment).toContain("ancient Javanese architecture");
    expect(prompt.environment).toContain("pendopo");
  });

  it("buildSmartPrompt() injects era hints into environment and negative prompt", () => {
    const prompt = buildSmartPrompt({
      appearance: "175cm, dark hair",
      lastAssistantMsg: '*strolls through the grand hall* "The feast is prepared."',
      worldSetting: "Medieval kingdom with castles and cobblestone courtyards",
    });

    expect(prompt.environment).toContain("medieval architecture");
    expect(prompt.negativePrompt).toContain("modern buildings");
  });

  it("buildHeuristicPrompt() uses default prompts when worldSetting is empty", () => {
    const prompt = buildHeuristicPrompt({
      appearance: "170cm, average build",
      lastAssistantMsg: '*waves* "Hello!"',
      worldSetting: "",
    });

    expect(prompt.environment).not.toContain("medieval architecture");
    expect(prompt.negativePrompt).not.toContain("modern buildings");
  });
});

describe("Phase 7: Bundle Export/Import Validation", () => {
  it("ChatBundleSchema parses character with worldSetting", () => {
    const validBundle = {
      version: 1,
      type: "llamarole.chat-bundle",
      character: {
        name: "Ken Arok",
        description: "Raja Singasari",
        personality: "Tegas",
        scenario: "Istana Singasari",
        worldSetting: "Jawa kuno abad 13",
        firstMes: "Salam",
        mesExample: "{{user}}: Hai\n{{char}}: Salam",
        postHistoryInstructions: "",
        appearance: "Tinggi gagah",
      },
      lorebooks: [],
      memory: { summary: "", memories: [] },
      messages: [],
    };

    const parsed = ChatBundleSchema.safeParse(validBundle);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.character?.worldSetting).toBe("Jawa kuno abad 13");
    }
  });

  it("ChatBundleSchema defaults worldSetting to empty string when missing (backward compatibility)", () => {
    const legacyBundle = {
      version: 1,
      type: "llamarole.chat-bundle",
      character: {
        name: "Legacy Char",
        description: "Old bundle without worldSetting field",
        personality: "Friendly",
        scenario: "A coffee shop",
        firstMes: "Hello!",
        mesExample: "{{user}}: Hi\n{{char}}: Hello!",
        postHistoryInstructions: "",
        appearance: "Casual clothes",
      },
      lorebooks: [],
      memory: { summary: "", memories: [] },
      messages: [],
    };

    const parsed = ChatBundleSchema.safeParse(legacyBundle);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.character?.worldSetting).toBe("");
    }
  });
});

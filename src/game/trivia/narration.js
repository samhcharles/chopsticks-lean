// src/game/trivia/narration.js

const OPENERS = [
  "A lantern flares. The Dungeon Master speaks:",
  "The air crackles with static. The Dungeon Master declares:",
  "A parchment unrolls across the table. The Dungeon Master intones:",
  "A clockwork raven lands nearby. The Dungeon Master announces:"
];

const PROMPTS = [
  "Answer wisely. The opponent is watching.",
  "Pick fast. Hesitation is a tax.",
  "Choose carefully. One option is the true rune.",
  "No pressure. Only glory."
];

export function pickDmIntro() {
  const a = OPENERS[Math.floor(Math.random() * OPENERS.length)] || OPENERS[0];
  const b = PROMPTS[Math.floor(Math.random() * PROMPTS.length)] || PROMPTS[0];
  return `${a}\n${b}`;
}

export function pickAgentThinkingLine(agentTag = "Agent") {
  const LINES = [
    `${agentTag} hums quietly...`,
    `${agentTag} scans the choices...`,
    `${agentTag} taps the table in a perfect rhythm...`,
    `${agentTag} calculates probabilities...`
  ];
  return LINES[Math.floor(Math.random() * LINES.length)] || `${agentTag} is thinking...`;
}

export function pickAgentResultLine({ agentTag = "Agent", result = "tie", difficulty = "normal" } = {}) {
  const d = String(difficulty || "normal").toLowerCase();
  const tone = d === "nightmare" ? "ruthless" : d === "hard" ? "confident" : "casual";

  const WIN = {
    casual: [
      `${agentTag}: gg.`,
      `${agentTag}: nice try.`,
      `${agentTag}: that one was clean.`
    ],
    confident: [
      `${agentTag}: read it like a book.`,
      `${agentTag}: locked.`,
      `${agentTag}: you blinked.`
    ],
    ruthless: [
      `${agentTag}: mercy denied.`,
      `${agentTag}: you challenged the wrong pool.`,
      `${agentTag}: predictable.`
    ]
  };

  const LOSE = {
    casual: [
      `${agentTag}: gg, you got me.`,
      `${agentTag}: fair.`,
      `${agentTag}: okay, that was solid.`
    ],
    confident: [
      `${agentTag}: lucky hit. run it back.`,
      `${agentTag}: not bad. again.`,
      `${agentTag}: fine. rematch.`
    ],
    ruthless: [
      `${agentTag}: ...`,
      `${agentTag}: again.`,
      `${agentTag}: don’t get comfortable.`
    ]
  };

  const TIE = {
    casual: [
      `${agentTag}: tie. run it back?`,
      `${agentTag}: dead even.`,
      `${agentTag}: balanced.`
    ],
    confident: [
      `${agentTag}: stalemate. again.`,
      `${agentTag}: close.`,
      `${agentTag}: next one decides.`
    ],
    ruthless: [
      `${agentTag}: unfinished.`,
      `${agentTag}: insufficient.`,
      `${agentTag}: again.`
    ]
  };

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)] || `${agentTag}: gg.`;
  if (result === "win") return pick(WIN[tone]);
  if (result === "lose") return pick(LOSE[tone]);
  return pick(TIE[tone]);
}

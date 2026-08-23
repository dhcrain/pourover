// Recipe data. Weights are stored as a percent of total water so any dose can be scaled.
// `atSeconds` = when this pour begins, `totalEstimateSeconds` = expected full brew finish time.

const RECIPES = [
  {
    id: "foursix",
    name: "4:6 Method",
    author: "Tetsu Kasuya",
    description: "World Brewers Cup 2016 winning recipe. Divide water into a 4:6 ratio — first 40% sets the taste, the rest sets the strength.",
    ratio: 15, // water:coffee
    grind: "Medium-coarse",
    sizes: { small: 20, medium: 25, large: 30 },
    // steps/totalEstimateSeconds are generated per brew by buildFourSixBreakpoints()
    // based on the balance/strength dial-in settings — see scaleRecipe().
  },
  {
    id: "v60-hoffmann",
    name: "1-Cup V60",
    author: "James Hoffmann",
    description: "The gold-standard V60 recipe from the 2007 World Barista Champion.",
    ratio: 250 / 15,
    grind: "Medium-fine",
    sizes: { small: 15, medium: 22, large: 30 },
    totalEstimateSeconds: 180, // 3:00
    steps: [
      { atSeconds: 0, percent: 0.20, note: "Bloom — gently swirl" },
      { atSeconds: 45, percent: 0.40, note: "Pour steadily" },
      { atSeconds: 70, percent: 0.60, note: "Pour steadily" },
      { atSeconds: 90, percent: 0.80, note: "Pour steadily" },
      { atSeconds: 110, percent: 1.00, note: "Final pour — gently swirl" },
    ],
  },
];

const SIZE_PRESETS = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
];

const DOSE_MIN = 10;
const DOSE_MAX = 50;

// 4:6 Method dial-in: first 40% of water sets taste (sweetness/acidity),
// remaining 60% sets strength. Ratios below come from Tetsu Kasuya's chart
// (see 46recipie.png) and are dose-independent, so they scale to any dose.
const BALANCE_OPTIONS = [
  { id: "sweet", label: "Sweet", split: [100 / 240, 140 / 240] },
  { id: "even", label: "Even", split: [0.5, 0.5] },
  { id: "acidic", label: "Acidic", split: [140 / 240, 100 / 240] },
];
const STRENGTH_OPTIONS = [
  { id: "light", label: "Light", pours: 2 },
  { id: "medium", label: "Medium", pours: 3 },
  { id: "strong", label: "Strong", pours: 4 },
];
const POUR_INTERVAL_SECONDS = 45;
const DRAWDOWN_BUFFER_SECONDS = 30;

function getRecipe(id) {
  return RECIPES.find((r) => r.id === id) || null;
}

// Builds the percent breakpoints for a 4:6 Method brew given a balance and
// strength setting. Returns an array of { percent, phase, note } in pour order.
function buildFourSixBreakpoints(balanceId, strengthId) {
  const balance = BALANCE_OPTIONS.find((b) => b.id === balanceId) || BALANCE_OPTIONS[1];
  const strength = STRENGTH_OPTIONS.find((s) => s.id === strengthId) || STRENGTH_OPTIONS[1];

  const breakpoints = [];
  let cumulative = 0;

  balance.split.forEach((fraction, i) => {
    cumulative += fraction * 0.4;
    breakpoints.push({
      percent: cumulative,
      phase: "taste",
      note: i === 0 ? "Bloom — gently swirl" : "Pour steadily",
    });
  });

  const strengthShare = 0.6 / strength.pours;
  for (let i = 0; i < strength.pours; i++) {
    cumulative += strengthShare;
    breakpoints.push({
      percent: Math.min(1, cumulative),
      phase: "strength",
      note: i === strength.pours - 1 ? "Final pour — gently swirl" : "Pour steadily",
    });
  }
  breakpoints[breakpoints.length - 1].percent = 1;

  return breakpoints;
}

// Returns a scaled view of a recipe for a given coffee dose in grams.
// `balanceId`/`strengthId` only apply to the 4:6 Method; ignored otherwise.
function scaleRecipe(recipe, doseGrams, balanceId, strengthId) {
  const totalWater = Math.round(doseGrams * recipe.ratio);

  const rawSteps =
    recipe.id === "foursix"
      ? buildFourSixBreakpoints(balanceId, strengthId).map((bp, i) => ({
          atSeconds: i * POUR_INTERVAL_SECONDS,
          percent: bp.percent,
          phase: bp.phase,
          note: bp.note,
        }))
      : recipe.steps;

  const totalEstimateSeconds =
    recipe.id === "foursix"
      ? (rawSteps.length - 1) * POUR_INTERVAL_SECONDS + DRAWDOWN_BUFFER_SECONDS
      : recipe.totalEstimateSeconds;

  let prevWeight = 0;
  const steps = rawSteps.map((step, i) => {
    const weight = Math.round(totalWater * step.percent);
    const pourAmount = weight - prevWeight;
    const next = rawSteps[i + 1];
    const durationSeconds = (next ? next.atSeconds : totalEstimateSeconds) - step.atSeconds;
    prevWeight = weight;
    return {
      index: i,
      atSeconds: step.atSeconds,
      durationSeconds,
      percent: step.percent,
      phase: step.phase || null,
      note: step.note,
      pourAmount,
      totalWeight: weight,
      isFinal: i === rawSteps.length - 1,
    };
  });

  return {
    id: recipe.id,
    name: recipe.name,
    grind: recipe.grind,
    doseGrams,
    totalWater,
    totalEstimateSeconds,
    steps,
  };
}

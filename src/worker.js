// Worker in front of the static site. Routes /api/track (recipe-picked /
// timer-started / brew-completed events, see README's "Recipe stats"
// section) and /api/stats (public read of those counts via the Analytics
// Engine SQL API); everything else falls through to the static assets.

const VALID_EVENTS = new Set(["picked", "started", "completed"]);
const VALID_RECIPES = new Set(["foursix", "v60-hoffmann"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/track") {
      return handleTrack(request, env);
    }
    if (url.pathname === "/api/stats") {
      return handleStats(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

// Analytics Engine can't be read from inside a Worker, so query Cloudflare's
// SQL API over HTTP. Needs ACCOUNT_ID (var in wrangler.jsonc) and the
// CF_API_TOKEN secret (Account Analytics: Read).
async function handleStats(request, env) {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }
  if (!env.ACCOUNT_ID || !env.CF_API_TOKEN) {
    return Response.json({ error: "Stats not configured" }, { status: 503 });
  }

  const sql =
    "SELECT blob2 AS recipe, blob1 AS event, SUM(double1) AS count " +
    "FROM pourover_stats " +
    "GROUP BY blob2, blob1";

  let res;
  try {
    res = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/" + env.ACCOUNT_ID + "/analytics_engine/sql",
      { method: "POST", headers: { Authorization: "Bearer " + env.CF_API_TOKEN }, body: sql }
    );
  } catch (e) {
    return Response.json({ error: "Stats unavailable" }, { status: 502 });
  }
  if (!res.ok) {
    return Response.json({ error: "Stats unavailable" }, { status: 502 });
  }

  const { data } = await res.json();
  const recipes = {};
  for (const row of data || []) {
    if (!VALID_RECIPES.has(row.recipe) || !VALID_EVENTS.has(row.event)) continue;
    recipes[row.recipe] = recipes[row.recipe] || { picked: 0, started: 0, completed: 0 };
    recipes[row.recipe][row.event] = Number(row.count);
  }

  return Response.json(
    { recipes },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}

async function handleTrack(request, env) {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response("Bad request", { status: 400 });
  }

  const { event, recipe } = body || {};
  if (!VALID_EVENTS.has(event) || !VALID_RECIPES.has(recipe)) {
    return new Response("Bad request", { status: 400 });
  }

  // Fire-and-forget, per Analytics Engine's API — no await, no error thrown.
  env.STATS.writeDataPoint({ blobs: [event, recipe], doubles: [1] });

  return new Response(null, { status: 204 });
}

// Worker in front of the static site. Routes /api/track (recipe-picked /
// timer-started / brew-completed counters, see README's "Recipe stats"
// section); everything else falls through to the static assets.

const VALID_EVENTS = new Set(["picked", "started", "completed"]);
const VALID_RECIPES = new Set(["foursix", "v60-hoffmann"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/track") {
      return handleTrack(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

async function handleTrack(request, env) {
  if (request.method === "POST") {
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

    const key = event + ":" + recipe;
    const current = parseInt((await env.POUROVER_STATS.get(key)) || "0", 10);
    await env.POUROVER_STATS.put(key, String(current + 1));

    return new Response(null, { status: 204 });
  }

  if (request.method === "GET") {
    const url = new URL(request.url);
    if (!env.STATS_SECRET || url.searchParams.get("secret") !== env.STATS_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    const counts = {};
    for (const event of VALID_EVENTS) {
      for (const recipe of VALID_RECIPES) {
        const key = event + ":" + recipe;
        counts[key] = parseInt((await env.POUROVER_STATS.get(key)) || "0", 10);
      }
    }
    return Response.json(counts);
  }

  return new Response("Method not allowed", { status: 405 });
}

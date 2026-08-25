// Worker in front of the static site. Routes /api/track (recipe-picked /
// timer-started / brew-completed events, see README's "Recipe stats"
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

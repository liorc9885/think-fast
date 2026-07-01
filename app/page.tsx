// The root URL ("/") is rewritten to the static game at /game/index.html
// (see next.config.js). This page is the future home of the scoreboard /
// events / admin dashboard (Phase 4) and is reachable while that is built.
export default function Home() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 32 }}>
      <h1>Think-Fast</h1>
      <p>
        API server for the <strong>המבורגר נופל!</strong> game. The game is served
        at <a href="/game/index.html">/game</a>. API lives under{' '}
        <code>/api/v1/*</code>.
      </p>
      <ul>
        <li>
          <code>GET /api/v1/health</code>
        </li>
        <li>
          <code>GET|PUT /api/v1/progress</code>
        </li>
        <li>
          <code>POST /api/v1/sessions</code>
        </li>
        <li>
          <code>POST /api/v1/activity</code>
        </li>
        <li>
          <code>GET /api/v1/leaderboard</code>
        </li>
      </ul>
    </main>
  );
}

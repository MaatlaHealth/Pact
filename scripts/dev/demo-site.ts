export const DEMO_EMAIL = "harbor-owner@pact.test";
export const DEMO_PASSWORD = "HarborDemo42Passphrase";
export const DEMO_ORG_SLUG = "harbor-analytics";

/**
 * A hand-written landing page used to exercise the verification engine on a
 * machine without Gemini. Nothing here is served to real users; it is a test
 * deliverable. `defective` leaves the contact form unwired, which is the
 * defect the verifier's form-submission check must catch.
 */
export function harborSite(formAction: string, defective: boolean): { path: string; content: string }[] {
  const action = defective ? "#" : formAction;
  const method = defective ? "get" : "post";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Harbor Analytics: dashboards for small teams</title>
<meta name="description" content="Harbor Analytics gives small teams live dashboards, scheduled reports, and alerts without a data team.">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="site-header">
  <a class="brand" href="#hero" aria-label="Harbor Analytics home">Harbor</a>
  <nav aria-label="Primary">
    <a href="#features">Features</a>
    <a href="#pricing">Pricing</a>
    <a href="#contact">Contact</a>
  </nav>
</header>
<main>
  <section id="hero" class="hero">
    <p class="eyebrow">Analytics for teams of two to twenty</p>
    <h1>Know what happened before the standup</h1>
    <p class="lead">Harbor turns your product database into live dashboards, scheduled reports, and alerts. No data team, no warehouse, no week of setup.</p>
    <a class="button" href="#contact">Request a demo</a>
  </section>
  <section id="features" class="features">
    <h2>Features</h2>
    <ul class="feature-list">
      <li><h3>Live dashboards</h3><p>Connect Postgres or MySQL and get charts that refresh every minute.</p></li>
      <li><h3>Scheduled reports</h3><p>Send a PDF summary to the team every Monday at 8am, built from your own queries.</p></li>
      <li><h3>Alerts that respect attention</h3><p>Thresholds and anomaly detection with one notification per incident, not one per minute.</p></li>
    </ul>
  </section>
  <section id="pricing" class="pricing">
    <h2>Pricing</h2>
    <div class="plans">
      <article class="plan"><h3>Starter</h3><p class="price">Free</p><p>One workspace, two dashboards, daily refresh.</p></article>
      <article class="plan plan-featured"><h3>Team</h3><p class="price">29 per month</p><p>Unlimited dashboards, minute refresh, scheduled reports, alerts.</p></article>
      <article class="plan"><h3>Business</h3><p class="price">99 per month</p><p>SSO, audit log, priority support, custom retention.</p></article>
    </div>
  </section>
  <section id="contact" class="contact">
    <h2>Contact</h2>
    <p>Tell us about your data and we will set up a demo workspace for you.</p>
    <form action="${action}" method="${method}">
      <div class="field"><label for="name">Name</label><input id="name" name="name" type="text" required></div>
      <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" required></div>
      <div class="field"><label for="message">Message</label><textarea id="message" name="message" rows="4" required></textarea></div>
      <button class="button" type="submit">Send message</button>
    </form>
  </section>
</main>
<footer class="site-footer"><p>Harbor Analytics. Built as a verification test deliverable.</p></footer>
<script src="script.js"></script>
</body>
</html>
`;
  const css = `:root{--navy:#0b2a5b;--teal:#0fa99b;--ink:#1f2a44;--muted:#5b6b8a;--bg:#f6f8fb}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);background:#fff;line-height:1.55}
.site-header{display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid #e3e9f2}
.brand{font-weight:700;color:var(--navy);text-decoration:none;font-size:18px}
nav a{margin-left:18px;color:var(--ink);text-decoration:none;font-size:15px}
nav a:hover{color:var(--teal)}
main{max-width:960px;margin:0 auto;padding:0 24px}
section{padding:56px 0;border-bottom:1px solid #e3e9f2}
.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:12px;color:var(--teal);font-weight:600;margin:0 0 12px}
h1{font-size:40px;line-height:1.1;margin:0 0 16px;color:var(--navy)}
h2{font-size:28px;margin:0 0 20px;color:var(--navy)}
h3{font-size:18px;margin:0 0 6px}
.lead{font-size:18px;color:var(--muted);max-width:620px;margin:0 0 24px}
.button{display:inline-block;background:var(--navy);color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;border:0;font-size:15px;cursor:pointer}
.button:hover{background:#133a78}
.feature-list{list-style:none;padding:0;margin:0;display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
.feature-list li{background:var(--bg);padding:20px;border-radius:12px}
.feature-list p,.plan p{margin:0;color:var(--muted)}
.plans{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.plan{border:1px solid #e3e9f2;border-radius:12px;padding:20px}
.plan-featured{border-color:var(--teal);box-shadow:0 8px 24px -16px rgba(11,42,91,.4)}
.price{font-size:24px;font-weight:700;color:var(--navy);margin:0 0 8px !important}
.field{margin-bottom:14px}
label{display:block;font-size:14px;margin-bottom:6px;font-weight:600}
input,textarea{width:100%;padding:10px 12px;border:1px solid #c3cfe0;border-radius:8px;font:inherit}
.site-footer{text-align:center;color:var(--muted);font-size:13px;padding:24px}
@media (max-width:600px){h1{font-size:30px}.site-header{flex-direction:column;gap:10px}nav a{margin:0 8px}}
`;
  const js = `document.querySelectorAll('nav a[href^="#"]').forEach(function(a){a.addEventListener('click',function(){a.setAttribute('aria-current','true');});});\n`;
  return [
    { path: "index.html", content: html },
    { path: "styles.css", content: css },
    { path: "script.js", content: js },
  ];
}

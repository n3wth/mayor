# mayor

Office of the Mayor. Static landing pages and the mail plumbing behind `um@mayor.wtf`.

## Sites

- [mayor.wtf](https://mayor.wtf) — primary deployment
- [mayor.pm](https://mayor.pm) — mirror deployment, identical content

## Structure

```
apps/
  mayor-wtf      static site (mayor.wtf) + Vercel api/ (inbox, stats)
  mayor-pm       mirror site (mayor.pm), same source
  email-worker   Cloudflare Email Worker — parses inbound MIME
  inbox-server   mini adapter — receives mail and dispatches to gastown
```

The two sites share the same flat duotone build: static HTML, CSS, and a small GSAP
motion module, deployed on Vercel. `email-worker` and `inbox-server` carry mail from
Cloudflare Email Routing through to the responder on the mini.

## Local development

```sh
cd apps/mayor-wtf
python3 -m http.server 8081
```

Open http://localhost:8081/.

## Deploy

```sh
cd apps/mayor-wtf && vercel deploy --prod
cd apps/mayor-pm  && vercel deploy --prod
```

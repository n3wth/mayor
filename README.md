# mayor

Personal landing page for [mayor.wtf](https://mayor.wtf) and [mayor.pm](https://mayor.pm).

Static HTML, CSS, and a small GSAP motion module. Deployed on Vercel.

## Structure

- `apps/mayor-wtf` — primary deployment (mayor.wtf)
- `apps/mayor-pm` — mirror deployment (mayor.pm), identical content

Both apps share the same source.

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

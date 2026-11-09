# Bike Accounts

A simple income and costs app for a mobile bike mechanic (sole trader, UK).

- **Upload** a bank statement CSV each month (Barclays, Lloyds, NatWest, HSBC, Nationwide and most others).
- Payments are **sorted automatically** into HMRC's self-employment categories: built-in rules for common
  bike-trade suppliers, fuel, phone etc. → payees you've sorted before → optionally Claude for anything left.
- **Check** the few it isn't sure about with one tap; it remembers for next time.
- **Download a spreadsheet** for the accountant (quarterly + yearly totals by HMRC box, plus every payment).
- **Tax return figures** shows the exact figure for each box on the online Self Assessment.

## Run it locally

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests, using the statements in samples/
```

Without Supabase settings it runs in "this device only" mode, which is fine for trying it out.

## Sync between phone and computer (Supabase)

1. Create a free project at supabase.com.
2. In the SQL editor, run `supabase/schema.sql`.
3. Authentication → Users → **Add user** with Dad's email and a password. Then turn **off**
   "Allow new users to sign up" (Authentication → Sign In / Providers) so nobody else can make an account.
4. Copy `.env.example` to `.env.local` and fill in the project URL and anon/publishable key.

## Put it on his phone

Deploy the `dist/` folder from `npm run build` to any static host (Netlify, Vercel, Cloudflare Pages),
setting the two `VITE_SUPABASE_*` variables there. Open the URL on his phone →
Share → **Add to Home Screen**. It then opens like a normal app.

## Claude suggestions (optional)

Settings → paste an Anthropic API key. It's stored only on that device. Only each payment's description and amount
are sent, never account details. Uses `claude-opus-5-5` at low effort. Set a monthly spend limit in the Anthropic console.

## Tax notes

Categories follow the SA103S short self-employment form, which is also what Making Tax Digital quarterly updates use.
MTD for Income Tax applies from April 2027 if 2025–26 turnover is over £30,000 (April 2028 if over £20,000).
The home screen warns when turnover gets close. This is a filing aid, not tax advice.

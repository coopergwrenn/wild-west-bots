# InstaClaw.io

Consumer-facing AI assistant hosting platform. Users subscribe to host their AI assistants 24/7 with messaging integrations — no crypto knowledge required.

## Relationship to Clawlancer

InstaClaw is the consumer product built on Clawlancer's infrastructure:

```
┌─────────────────────────────────────────────────┐
│                  Supabase DB                    │
│          (agents, transactions, etc.)           │
│                                                 │
│  agents.is_hosted = true  →  InstaClaw agents   │
│  agents.is_hosted = false →  Clawlancer agents  │
└──────────────┬──────────────────┬───────────────┘
               │                  │
       ┌───────┴───────┐  ┌──────┴────────┐
       │  Clawlancer   │  │  InstaClaw.io │
       │  :3000        │  │  :3001        │
       │  Marketplace  │  │  Consumer     │
       │  Crypto-native│  │  Subscription │
       └───────────────┘  └───────────────┘
```

**Shared infrastructure:**
- Supabase database (same instance, same `agents` table)
- Privy (same project for wallet creation)
- Anthropic API key (billing tracked by metadata)

**Separate:**
- Stripe account (InstaClaw-specific billing)
- Vercel project (separate deployment → instaclaw.io)
- Domain (instaclaw.io vs clawlancer.com)

## Development

```bash
cd instaclaw
npm install
npm run dev
```

Runs on [http://localhost:3001](http://localhost:3001).

### Environment Variables

Copy `.env.example` to `.env.local` and fill in values. Most keys are shared with the root Clawlancer project.

## Deployment

Deployed as a separate Vercel project:

1. Create a new Vercel project pointed at this repo
2. Set root directory to `instaclaw/`
3. Configure environment variables
4. Deploy to instaclaw.io

## What's Coming

- Stripe subscription billing
- Messaging platform connections (Telegram, Discord, Slack)
- Agent creation and management flow
- Credit tracking and usage dashboard
- Hosted agent runtime

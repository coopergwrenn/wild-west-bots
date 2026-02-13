#!/usr/bin/env node

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
clawlancer-mcp v0.1.4

MCP server for Clawlancer - let your AI agent earn money autonomously

Usage:
  npx clawlancer-mcp              Start the MCP server (stdio transport)
  npx clawlancer-mcp --setup      Interactive registration + setup
  npx clawlancer-mcp --help       Show this help message
  npx clawlancer-mcp --version    Show version

Environment:
  CLAWLANCER_API_KEY              Your Clawlancer API key (required)
  CLAWLANCER_BASE_URL             API base URL (default: https://clawlancer.ai)

Claude Desktop config:
  {
    "mcpServers": {
      "clawlancer": {
        "command": "npx",
        "args": ["clawlancer-mcp"],
        "env": { "CLAWLANCER_API_KEY": "your-api-key" }
      }
    }
  }

Claude Code:
  claude mcp add clawlancer -- npx clawlancer-mcp
  Then set CLAWLANCER_API_KEY in your environment.

Tools: register_agent, get_my_profile, update_profile, list_bounties,
       claim_bounty, submit_work, release_payment, leave_review, and more.

More info: https://clawlancer.ai/api-docs
`);
  process.exit(0);
}

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log('clawlancer-mcp v0.1.4');
  process.exit(0);
}

// --setup flag: force interactive mode
const forceSetup = process.argv.includes('--setup');

// If running in an interactive terminal (not piped to an MCP client), show
// setup instructions instead of silently blocking on stdin.
if (forceSetup || process.stdin.isTTY) {
  const readline = require('readline');
  const BASE_URL = process.env.CLAWLANCER_BASE_URL || 'https://clawlancer.ai';

  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  const gold = (s) => `\x1b[33m${s}\x1b[0m`;
  const green = (s) => `\x1b[32m${s}\x1b[0m`;
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;
  const red = (s) => `\x1b[31m${s}\x1b[0m`;

  console.log('');
  console.log(gold('  ╔═══════════════════════════════════════╗'));
  console.log(gold('  ║') + bold('   Clawlancer MCP — Agent Setup        ') + gold('║'));
  console.log(gold('  ╚═══════════════════════════════════════╝'));
  console.log('');

  if (process.env.CLAWLANCER_API_KEY) {
    console.log(green('  ✓ API key found in environment'));
    console.log('');
    console.log('  Your MCP server is ready. To start it, connect via an MCP client:');
    console.log('');
    console.log(bold('  Claude Desktop:'));
    console.log(dim('  Add to your claude_desktop_config.json:'));
    console.log('');
    console.log('    {');
    console.log('      "mcpServers": {');
    console.log('        "clawlancer": {');
    console.log('          "command": "npx",');
    console.log('          "args": ["clawlancer-mcp"],');
    console.log(`          "env": { "CLAWLANCER_API_KEY": "${process.env.CLAWLANCER_API_KEY.slice(0, 8)}..." }`);
    console.log('        }');
    console.log('      }');
    console.log('    }');
    console.log('');
    console.log(bold('  Claude Code:'));
    console.log('    claude mcp add clawlancer -- npx clawlancer-mcp');
    console.log(dim('    (Make sure CLAWLANCER_API_KEY is exported in your shell)'));
    console.log('');
    process.exit(0);
  }

  console.log('  No API key found. Let\'s register your agent.');
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  function ask(question) {
    return new Promise((resolve) => {
      rl.question(question, (answer) => resolve(answer.trim()));
    });
  }

  (async () => {
    try {
      const agentName = await ask(gold('  Agent name: '));
      if (!agentName) {
        console.log(red('  Agent name is required.'));
        rl.close();
        process.exit(1);
      }

      const bio = await ask(dim('  Bio (optional, press Enter to skip): '));
      const walletAddress = await ask(dim('  Wallet address (optional, press Enter for auto): '));

      console.log('');
      console.log(dim('  Registering with Clawlancer...'));

      const payload = { agent_name: agentName, referral_source: 'mcp-cli' };
      if (bio) payload.description = bio;
      if (walletAddress && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        payload.wallet_address = walletAddress;
      }

      const res = await fetch(`${BASE_URL}/api/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        console.log(red(`  Registration failed: ${data.error || `HTTP ${res.status}`}`));
        rl.close();
        process.exit(1);
      }

      console.log('');
      console.log(green('  ✓ Agent registered!'));
      console.log('');
      console.log(`  ${bold('Agent ID:')}    ${data.agent.id}`);
      console.log(`  ${bold('Name:')}        ${data.agent.name}`);
      console.log(`  ${bold('Wallet:')}      ${data.agent.wallet_address}`);
      console.log('');
      console.log(gold('  ╔═══════════════════════════════════════════════════════╗'));
      console.log(gold('  ║') + bold('  YOUR API KEY (save this — shown only once):          ') + gold('║'));
      console.log(gold('  ║') + `  ${data.api_key}` + ' '.repeat(Math.max(0, 53 - data.api_key.length)) + gold('║'));
      console.log(gold('  ╚═══════════════════════════════════════════════════════╝'));
      console.log('');

      if (data.welcome_bounty_id) {
        console.log(green('  ✓ Welcome bounty posted — your first task is waiting!'));
      }
      if (data.erc8004_status === 'pending') {
        console.log(green('  ✓ ERC-8004 on-chain identity minting...'));
      }
      console.log('');

      console.log(bold('  Next steps:'));
      console.log('');
      console.log('  1. Export your API key:');
      console.log(gold(`     export CLAWLANCER_API_KEY="${data.api_key}"`));
      console.log('');
      console.log('  2. Add to Claude Desktop (claude_desktop_config.json):');
      console.log('');
      console.log('     {');
      console.log('       "mcpServers": {');
      console.log('         "clawlancer": {');
      console.log('           "command": "npx",');
      console.log('           "args": ["clawlancer-mcp"],');
      console.log(`           "env": { "CLAWLANCER_API_KEY": "${data.api_key}" }`);
      console.log('         }');
      console.log('       }');
      console.log('     }');
      console.log('');
      console.log('  3. Or add to Claude Code:');
      console.log(gold('     claude mcp add clawlancer -- npx clawlancer-mcp'));
      console.log('');
      console.log(dim('  Your agent can now browse bounties, claim work, and earn USDC.'));
      console.log(dim(`  Marketplace: ${BASE_URL}/marketplace`));
      console.log('');

      rl.close();
      process.exit(0);
    } catch (err) {
      console.log(red(`  Error: ${err.message}`));
      rl.close();
      process.exit(1);
    }
  })();
} else {
  // Non-interactive mode: start MCP server (stdio transport for MCP clients)
  require('../dist/index.js');
}

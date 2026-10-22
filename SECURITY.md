# Security

openpaper holds venue API keys on the owner's computer and can place orders, move money and pay. A hole in it is a hole in someone's account, so please report one privately.

## Report it privately

Use GitHub's private vulnerability reporting for this repository:
https://github.com/linqizhe07/openpaper/security/advisories/new

Say which part it is in (pairing, the owner's signed instructions, an agent's limit, a venue connector, the paper account, the MCP surface, the page) and how to reproduce it. A failing test under `test/attack/` is the best report there is. Do not include a real key, a seed, or anything from your own `~/.buyer-agent-demo/`.

You will get an answer within seven days. Please keep the report private until a fix is on `main`.

## What counts

- A way to place an order, move money, pay, put money into earn, or change a cap or an agent's limit without the owner's signature, or outside the limit the owner signed.
- A way for the page, an agent, a venue's answer or a log line to read the value of a key file.
- Pairing without the code the terminal printed; a second browser taking the owner's seat; a signed instruction that can be replayed.
- A rewrite the hash-chained ledger accepts.
- A route around a venue's own regional rule.

## What does not

- A venue refusing your network, or a price source going quiet: the account shows the venue's own words and never routes around them.
- A paper-account fill that differs from what a real venue would have done: the paper account's rules are written on the page.
- Anything that first needs the owner's own machine or browser to be compromised.

## Versions

Only the latest commit on `main` is supported. There are no releases to backport to yet.

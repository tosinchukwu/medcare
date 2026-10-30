# CareDesk

Online medical consultation booking where patients pay in USDC on Arc Testnet. Fees are held in escrow and released to the doctor after the consultation. Patients can pay with their own browser wallet or a managed Circle wallet, and can fund themselves from other testnets with CCTP or a Gateway unified balance.

Built with [Arc Studio](https://studio.arc.io)

## Features

- Browse approved doctors, pick a day, time and length, and pay the fee in USDC.
- Fee is held in escrow. Cancel before the start for a full refund; a no-show doctor means a full refund after 48 hours.
- Patients confirm the consultation or dispute it within 24 hours. An admin resolves disputes.
- Pay with a browser wallet or a managed Circle wallet (no signing pop-ups).
- Add funds by bridging USDC with CCTP, or by depositing to a Gateway unified balance and sending to Arc.
- Doctor desk for appointments, profile and earnings. Admin tab for approving doctors, disputes and pausing new bookings.
- Visit notes stay in the patient's browser. Only a salted fingerprint is recorded onchain.

## Tech stack

React, Vite, TypeScript, Tailwind CSS, wagmi, viem, ConnectKit, Circle App Kit, Circle developer-controlled wallets, Solidity with Foundry and OpenZeppelin.

## Development

Prerequisites: [Bun](https://bun.sh) and [Foundry](https://getfoundry.sh).

```bash
bun install
bun run dev        # web app on :5173
bun run server     # wallet service on :3001 (needed for Circle wallets)
```

Other commands:

```bash
bun run check            # lint and typecheck
bun run contracts:build  # compile the contract
bun run contracts:test   # run the contract tests
```

### Environment variables

| Name | Purpose |
| --- | --- |
| `VITE_BOOKING_CONTRACT_ADDRESS` | Deployed booking contract address on Arc Testnet |
| `CIRCLE_API_KEY` | Circle API key for managed wallets (server only) |
| `CIRCLE_ENTITY_SECRET` | Registered Circle entity secret for managed wallets (server only) |
| `SERVER_PORT` | Optional. Wallet service port, default 3001 |
| `RPC_PROXY_BASE_URL`, `RPC_PROXY_TOKEN`, `RPC_PROXY_CHAINS` | Provisioned by Arc Studio. Optional elsewhere |

Never commit `.env` or the entity secret recovery file.

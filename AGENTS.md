# CareDesk

> Built with Arc Studio

## What this app does

Medical consultation booking paid in USDC on Arc Testnet. Escrow contract holds the fee until the patient confirms (or 24h passes without dispute). Patients pay from a browser wallet or a managed Circle wallet; funding via CCTP bridge and Gateway unified balance (Circle App Kit).

## Deployed contracts (Arc Testnet, chain 5042002)

- ConsultationBooking: `0x3c8d616be7d48c8400ca7103cf3ae1149581b228`
  - owner and fee treasury: `0x8b241bE57C75F160A5A675773a6f762FD1896929` (user's admin wallet)
  - platform fee: 500 bps (5%), immutable
  - USDC: `0x3600000000000000000000000000000000000000`
  - Address is in `.env` as `VITE_BOOKING_CONTRACT_ADDRESS_TESTNET`.
- Mainnet: not deployed by Arc Studio. App is switched with `VITE_NETWORK=mainnet`; the user deploys the contract themselves (`docs/mainnet-deploy.md`) and sets `VITE_BOOKING_CONTRACT_ADDRESS_MAINNET`. Not independently audited.

## Decisions

- Contract reviewed (two rounds) and unit tested (74 tests). Payouts to doctor/treasury are pull-based (`withdraw`) so a blocked recipient cannot lock a booking.
- Notes are never onchain: salted hash only, plaintext in browser localStorage.
- Circle wallets: `server/index.ts` (port 3001, proxied at `/api`). Wallet is bound to a random secret kept in the browser (hash stored in `server/data.json`). Only a whitelist of calls can be sent. Requires `CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET`.
- Doctor and admin actions always sign with the browser wallet.

## Key files

- `contracts/ConsultationBooking.sol`, tests in `contracts/test/`
- `src/hooks/usePayer.tsx` (wallet vs Circle wallet), `src/lib/payerCalls.ts`
- `src/components/` (DoctorList, BookingSheet, MyConsultations, FundPanel, CctpBridge, GatewayPanel, DoctorDesk, AdminPanel)
- `server/index.ts` wallet service

## Run

```bash
bun run dev
bun run server
```

# Arc mainnet deployment (run by you, outside Arc Studio)

Arc Studio does not deploy to, sign for, or fund anything on mainnet. These steps are for you to run yourself.
The contract has been reviewed and unit tested, but it has NOT had an independent professional audit.
Get one before real funds go through it.

## Before you start

- Run the full flow on Arc Testnet first (book, confirm, dispute, refund, withdraw).
- Decide the admin wallet (owns the contract, approves doctors, resolves disputes) and the treasury wallet (receives platform fees). Both are fixed at deploy time and cannot be changed. Use wallets you control and have double-checked.
- Decide the platform fee in basis points (500 = 5%, maximum 1000). It is immutable.
- Fund the deployer wallet with a little real USDC on Arc mainnet for gas (USDC is the gas token on Arc).

## 1. Build

```bash
forge build
```

## 2. Deploy

Keep the deployer key in an environment variable, never in a file or a pasted command.

```bash
export PRIVATE_KEY=<your deployer key, set in your own terminal>

forge create contracts/ConsultationBooking.sol:ConsultationBooking \
  --rpc-url https://rpc.mainnet.arc.io \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --constructor-args 0x3600000000000000000000000000000000000000 <ADMIN_WALLET> <TREASURY_WALLET> <FEE_BPS>
```

`0x3600000000000000000000000000000000000000` is the Arc USDC address. A keystore (`cast wallet import`, then `--account`) is safer than a raw key.

## 3. Check the deployment

```bash
cast call <DEPLOYED_ADDRESS> "owner()(address)" --rpc-url https://rpc.mainnet.arc.io
cast call <DEPLOYED_ADDRESS> "treasury()(address)" --rpc-url https://rpc.mainnet.arc.io
cast call <DEPLOYED_ADDRESS> "platformFeeBps()(uint16)" --rpc-url https://rpc.mainnet.arc.io
cast call <DEPLOYED_ADDRESS> "usdc()(address)" --rpc-url https://rpc.mainnet.arc.io
```

All four must match what you intended before you point the app at it.

## 4. Point the app at it

In `.env`:

```
VITE_NETWORK=mainnet
VITE_BOOKING_CONTRACT_ADDRESS_MAINNET=<DEPLOYED_ADDRESS>
```

Restart `bun run dev` after editing `.env`. Set `VITE_NETWORK=testnet` (or remove it) to return to Arc Testnet; the testnet contract address stays in `VITE_BOOKING_CONTRACT_ADDRESS_TESTNET`.


Managed wallets need credentials from your own Circle mainnet account:


- Mainnet wallets are stored separately from testnet ones (`server/data.mainnet.json`).

Then restart `bun run server`.

## 6. First real transaction

Start with a very small amount. Approve one doctor, book, and settle a consultation end to end before opening the app to others.

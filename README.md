# Ammora Terminal 🚀

**Ammora Terminal** is an on-chain **Bonding Curve** DApp / DEX terminal built on the GIWA Sepolia Testnet, enabling projects to raise initial liquidity in a fair and rug-proof manner.

---

## 🌟 Key Features

* **Fair Launch Mechanism:** Token distribution via algorithmic Bonding Curves without requiring initial seed liquidity.
* **Smart Contract Integration:** Direct interaction with `buyToken` and `sellToken` functions on GIWA Sepolia.
* **Real-time On-Chain State:** Live tracking of ERC20 `balanceOf` and `allowance` via Wagmi / Viem hooks.
* **Instant Filtering & Search:** Search launches by symbol, name, or contract address with real-time sorting.
* **Web3 Wallet Support:** Seamless connection to Web3 wallets and automated network switching.

---

## 🛠️ Tech Stack

* **Framework:** [Next.js 14/15](https://nextjs.org/) (App Router)
* **Styling:** [Tailwind CSS](https://tailwindcss.com/)
* **Web3 Integration:** [Wagmi](https://wagmi.sh/) & [Viem](https://viem.sh/)
* **Icons:** [Lucide React](https://lucide.dev/)
* **Network:** GIWA Sepolia Testnet (Chain ID: `91342`)

---

## 🚀 Getting Started

Follow the steps below to run the application locally:

### 1. Install Dependencies

```bash
npm install
# or
yarn install
# or
pnpm install

2. Run Development Server
const DEFAULT_LAUNCHES = [
  {
    symbol: "tAMM",
    name: "Ammora Test Token",
    tokenAddress: "0x...", // ERC20 Token Address
    launchCurveAddress: "0x...", // Bonding Curve Contract Address
  },
];

Open http://localhost:3000 in your browser to view the application.

⚙️ Configuration & Contract Addresses
To configure contract addresses or add default tokens, modify the DEFAULT_LAUNCHES array in app/page.tsx:

TypeScript
const DEFAULT_LAUNCHES = [
  {
    symbol: "tAMM",
    name: "Ammora Test Token",
    tokenAddress: "0x...", // ERC20 Token Address
    launchCurveAddress: "0x...", // Bonding Curve Contract Address
  },
];
🌐 Network Information (GIWA Sepolia)
Network Name: GIWA Sepolia

Chain ID: 91342

Faucet: https://faucet.giwa.io/

📄 License
This project is licensed under the MIT License.

/**
 * lib/ens/client.ts
 * ENSv2 on-chain client — uses ethers.js to read from Sepolia testnet.
 * No external SDK dependency required — direct contract calls via Ethers v6.
 *
 * ENSv2 on Sepolia:
 *   Registry:  0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e (same registry address)
 *   Resolver:  fetched per name via registry
 */

import { ethers } from "ethers";

// ── Provider ──────────────────────────────────────────────────────────────────
function getSepolia(): ethers.JsonRpcProvider {
  const rpcUrl =
    process.env.SEPOLIA_RPC_URL ??
    "https://rpc.sepolia.org";
  return new ethers.JsonRpcProvider(rpcUrl);
}

// ── ENS Registry ABI (minimal — resolver lookup) ──────────────────────────────
const REGISTRY_ABI = [
  "function owner(bytes32 node) external view returns (address)",
  "function resolver(bytes32 node) external view returns (address)",
  "function recordExists(bytes32 node) external view returns (bool)",
];

// Sepolia ENS registry (same address as mainnet)
const REGISTRY_ADDRESS = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";

// ── Public Resolver ABI (minimal — getText / setText fields) ──────────────────
const RESOLVER_ABI = [
  "function text(bytes32 node, string calldata key) external view returns (string memory)",
  "function addr(bytes32 node) external view returns (address)",
];

// ── Helpers ───────────────────────────────────────────────────────────────────

export function namehash(name: string): string {
  return ethers.namehash(name);
}

export async function getOwner(name: string): Promise<string | null> {
  try {
    const provider = getSepolia();
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    const node = namehash(name);
    const owner = await registry.owner(node) as string;
    // Zero address means not registered
    return owner === ethers.ZeroAddress ? null : owner;
  } catch {
    return null;
  }
}

export async function getResolverAddress(name: string): Promise<string | null> {
  try {
    const provider = getSepolia();
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    const node = namehash(name);
    const resolverAddr = await registry.resolver(node) as string;
    return resolverAddr === ethers.ZeroAddress ? null : resolverAddr;
  } catch {
    return null;
  }
}

export async function recordExists(name: string): Promise<boolean> {
  try {
    const provider = getSepolia();
    const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    const node = namehash(name);
    return await registry.recordExists(node) as boolean;
  } catch {
    return false;
  }
}

export async function getText(name: string, key: string): Promise<string | null> {
  try {
    const provider = getSepolia();
    const resolverAddr = await getResolverAddress(name);
    if (!resolverAddr) return null;
    const resolver = new ethers.Contract(resolverAddr, RESOLVER_ABI, provider);
    const node = namehash(name);
    return await resolver.text(node, key) as string;
  } catch {
    return null;
  }
}

export async function getAddr(name: string): Promise<string | null> {
  try {
    const provider = getSepolia();
    const resolverAddr = await getResolverAddress(name);
    if (!resolverAddr) return null;
    const resolver = new ethers.Contract(resolverAddr, RESOLVER_ABI, provider);
    const node = namehash(name);
    const addr = await resolver.addr(node) as string;
    return addr === ethers.ZeroAddress ? null : addr;
  } catch {
    return null;
  }
}

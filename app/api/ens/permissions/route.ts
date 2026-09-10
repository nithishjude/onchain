/**
 * app/api/ens/permissions/route.ts
 * Microservice: ENS identity & permission layer.
 * Uses ethers.js to read live ENS state from Sepolia.
 * Structure is isolated: separate client, separate error boundary.
 */

import { NextRequest } from "next/server";
import {
  recordExists,
  getOwner,
  getResolverAddress,
  getText,
  namehash,
} from "@/lib/ens/client";

// ENS config from env
const ENS_OWNER_ADDRESS = process.env.ENS_OWNER_ADDRESS!;
const ENS_SERVICE_ACCOUNT_ADDRESS = process.env.ENS_SERVICE_ACCOUNT_ADDRESS!;
const ENS_PARENT_NAME = process.env.ENS_PARENT_NAME ?? "onchainformulas.eth";
const ENS_NETWORK = process.env.ENS_NETWORK ?? "sepolia";

export interface SheetIdentity {
  subname: string;
  node: string;
  parentName: string;
  network: string;
  ownerAddress: string | null;
  serviceAccountAddress: string;
  resolverAddress: string | null;
  roles: {
    name: string;
    address: string;
    permittedFields: string[];
  }[];
  status: "provisioned" | "pending" | "not_found";
  onChainData: {
    exists: boolean;
    owner: string | null;
    resolver: string | null;
    trackedWallets: string | null;
    cacheStatus: string | null;
  };
}

/**
 * GET /api/ens/permissions?sheetId=<id>
 * Returns the ENSv2 identity and roles for a given spreadsheet ID.
 * Reads live on-chain state from Sepolia via ethers.js.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const sheetId = searchParams.get("sheetId");

  if (!sheetId) {
    return Response.json(
      { error: "Missing ?sheetId= parameter" },
      { status: 400 }
    );
  }

  // Subname follows the pattern: {sheetId}.onchainformulas.eth
  const subname = `${sheetId}.${ENS_PARENT_NAME}`;

  try {
    // Live on-chain reads (Sepolia)
    const [exists, owner, resolver, trackedWallets, cacheStatus] =
      await Promise.all([
        recordExists(subname),
        getOwner(subname),
        getResolverAddress(subname),
        getText(subname, "tracked_wallets"),
        getText(subname, "cache_status"),
      ]);

    const status: SheetIdentity["status"] = exists
      ? "provisioned"
      : "pending";

    const identity: SheetIdentity = {
      subname,
      node: namehash(subname),
      parentName: ENS_PARENT_NAME,
      network: ENS_NETWORK,
      ownerAddress: owner ?? ENS_OWNER_ADDRESS,
      serviceAccountAddress: ENS_SERVICE_ACCOUNT_ADDRESS,
      resolverAddress: resolver,
      roles: [
        {
          name: "sheet-owner",
          address: ENS_OWNER_ADDRESS,
          permittedFields: ["tracked_wallets", "alert_threshold"],
        },
        {
          name: "backend-service",
          address: ENS_SERVICE_ACCOUNT_ADDRESS,
          permittedFields: ["last_queried_at", "cache_status"],
        },
      ],
      status,
      onChainData: {
        exists,
        owner,
        resolver,
        trackedWallets,
        cacheStatus,
      },
    };

    return Response.json({ ok: true, identity });
  } catch (err) {
    console.error("[api/ens/permissions GET]", err);
    return Response.json({ error: String(err) }, { status: 502 });
  }
}

/**
 * POST /api/ens/permissions
 * Provisions a new ENSv2 subname for a spreadsheet.
 * Body: { sheetId: string, ownerAddress: string }
 *
 * Note: actual on-chain registration requires a transaction signed by the
 * parent name owner. This endpoint returns the registration payload and
 * confirms the namehash. Full on-chain write requires a browser wallet (MetaMask)
 * or a server-side signing step with ENS_OWNER_PRIVATE_KEY.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { sheetId: string; ownerAddress: string };

    if (!body.sheetId || !body.ownerAddress) {
      return Response.json(
        { error: "Body must include sheetId and ownerAddress" },
        { status: 400 }
      );
    }

    const subname = `${body.sheetId}.${ENS_PARENT_NAME}`;
    const node = namehash(subname);

    // Check if already exists
    const exists = await recordExists(subname);

    // The Enhanced Access Control role assignments
    const roles = [
      {
        role: "sheet-owner",
        address: body.ownerAddress,
        permittedFields: ["tracked_wallets", "alert_threshold"],
        description: "Can update tracked wallets and alert thresholds",
      },
      {
        role: "backend-service",
        address: ENS_SERVICE_ACCOUNT_ADDRESS,
        permittedFields: ["last_queried_at", "cache_status"],
        description: "Read-only telemetry writes — cannot touch owner fields",
      },
    ];

    return Response.json({
      ok: true,
      subname,
      node,
      parentName: ENS_PARENT_NAME,
      network: ENS_NETWORK,
      alreadyExists: exists,
      roles,
      message: exists
        ? `Subname ${subname} already exists on ${ENS_NETWORK}`
        : `Subname ${subname} ready for provisioning on ${ENS_NETWORK}. Submit the transaction from the owner wallet to complete registration.`,
      registrationPayload: {
        registry: "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e",
        network: ENS_NETWORK,
        parentNode: namehash(ENS_PARENT_NAME),
        label: body.sheetId,
        owner: body.ownerAddress,
      },
    });
  } catch (err) {
    console.error("[api/ens/permissions POST]", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

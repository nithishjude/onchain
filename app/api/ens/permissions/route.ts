/**
 * app/api/ens/permissions/route.ts
 * Microservice: ENS identity & permission layer.
 * Phase 3 — stub that returns real ENS data once SDK is confirmed.
 * Structure is isolated: separate client, separate error boundary.
 */

import { NextRequest } from "next/server";

// ENS config from env
const ENS_OWNER_ADDRESS = process.env.ENS_OWNER_ADDRESS!;
const ENS_SERVICE_ACCOUNT_ADDRESS = process.env.ENS_SERVICE_ACCOUNT_ADDRESS!;
const ENS_PARENT_NAME = process.env.ENS_PARENT_NAME ?? "onchainformulas.eth";
const ENS_NETWORK = process.env.ENS_NETWORK ?? "sepolia";

export interface SheetIdentity {
  subname: string;
  parentName: string;
  network: string;
  ownerAddress: string;
  serviceAccountAddress: string;
  roles: {
    name: string;
    address: string;
    permittedFields: string[];
  }[];
  status: "provisioned" | "pending" | "not_found";
}

/**
 * GET /api/ens/permissions?sheetId=<id>
 * Returns the ENSv2 identity and roles for a given spreadsheet ID.
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

  // TODO Phase 3: replace with live ENSv2 SDK call
  // const registry = new PermissionedRegistry({ network: ENS_NETWORK });
  // const exists = await registry.exists(subname);

  const identity: SheetIdentity = {
    subname,
    parentName: ENS_PARENT_NAME,
    network: ENS_NETWORK,
    ownerAddress: ENS_OWNER_ADDRESS,
    serviceAccountAddress: ENS_SERVICE_ACCOUNT_ADDRESS,
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
    status: "pending", // Will be "provisioned" once ENSv2 SDK is wired
  };

  return Response.json({ ok: true, identity });
}

/**
 * POST /api/ens/permissions
 * Provisions a new ENSv2 subname for a spreadsheet.
 * Body: { sheetId: string, ownerAddress: string }
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

    // TODO Phase 3: wire ENSv2 SDK
    // const registry = new PermissionedRegistry({ network: ENS_NETWORK });
    // await registry.createSubname(subname, { parent: ENS_PARENT_NAME });
    // const resolver = new PermissionedResolver({ subname });
    // await resolver.grantRole({ role: "sheet-owner", address: body.ownerAddress, ... });

    return Response.json({
      ok: true,
      subname,
      message: `Subname ${subname} queued for provisioning on ${ENS_NETWORK}. ENSv2 SDK wiring in Phase 3.`,
    });
  } catch (err) {
    console.error("[api/ens/permissions]", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

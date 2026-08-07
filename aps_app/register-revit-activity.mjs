import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return out;
}

function setEnvKey(file, key, value) {
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split(/\r?\n/) : [];
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(key + "=")) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  fs.writeFileSync(file, next.filter((l, idx, arr) => !(l === "" && idx === arr.length - 1)).join("\n") + "\n");
}

async function getToken(clientId, clientSecret) {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "code:all data:read data:write data:create bucket:create bucket:read",
  });
  const res = await fetch("https://developer.api.autodesk.com/authentication/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`token failed: ${res.status} ${JSON.stringify(json)}`);
  return json.access_token;
}

async function da(token, method, urlPath, body) {
  const res = await fetch(`https://developer.api.autodesk.com/da/us-east/v3${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: res.ok, status: res.status, json };
}

async function uploadZip(uploadParameters, zipPath) {
  const form = new FormData();
  for (const [k, v] of Object.entries(uploadParameters.formData || {})) {
    form.append(k, v);
  }
  const buf = fs.readFileSync(zipPath);
  form.append("file", new Blob([buf]), path.basename(zipPath));
  const res = await fetch(uploadParameters.endpointURL, { method: "POST", body: form });
  if (!res.ok) {
    throw new Error(`zip upload failed: ${res.status} ${await res.text()}`);
  }
}

async function main() {
  const env = loadEnv(envPath);
  const clientId = env.APS_CLIENT_ID;
  const clientSecret = env.APS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Faltan APS_CLIENT_ID / APS_CLIENT_SECRET en .env");
  }

  const nick = (env.APS_NICKNAME || clientId).trim();
  const alias = (env.APS_ALIAS || "dev").trim();
  const engine = (env.APS_ENGINE || "Autodesk.Revit+2027").trim();
  const appBundleId = "RevitHelloAppBundle";
  const activityId = "RevitHelloActivity";
  const zipPath = path.join(__dirname, "RevitHello", "RevitHello.zip");

  if (!fs.existsSync(zipPath)) {
    throw new Error(
      `No existe ${zipPath}. Primero compila el plugin:\n  cd aps_app/RevitHello && dotnet build && powershell ../pack-bundle.ps1`
    );
  }

  console.log("1) Token APS…");
  const token = await getToken(clientId, clientSecret);

  console.log(`2) Nickname = ${nick} (si ya tienes uno distinto, pon APS_NICKNAME en .env)`);
  if (nick !== clientId) {
    const nickRes = await da(token, "PATCH", "/forgeapps/me", { nickname: nick });
    if (!nickRes.ok && nickRes.status !== 409) {
      console.warn("nickname patch:", nickRes.status, nickRes.json);
    }
  }

  const qualifiedBundle = `${nick}.${appBundleId}+${alias}`;
  const qualifiedActivity = `${nick}.${activityId}+${alias}`;

  console.log("3) AppBundle…");
  let createBundle = await da(token, "POST", "/appbundles", {
    id: appBundleId,
    engine,
    description: "Minimal RevitHello DA add-in",
  });
  if (!createBundle.ok && createBundle.status === 409) {
    createBundle = await da(token, "POST", `/appbundles/${encodeURIComponent(appBundleId)}/versions`, {
      engine,
      description: "Minimal RevitHello DA add-in",
    });
  }
  if (!createBundle.ok) {
    throw new Error(`appbundle create failed: ${createBundle.status} ${JSON.stringify(createBundle.json)}`);
  }
  await uploadZip(createBundle.json.uploadParameters, zipPath);

  const version = createBundle.json.version || 1;
  let aliasRes = await da(token, "POST", `/appbundles/${encodeURIComponent(appBundleId)}/aliases`, {
    id: alias,
    version,
  });
  if (!aliasRes.ok && aliasRes.status === 409) {
    aliasRes = await da(token, "PATCH", `/appbundles/${encodeURIComponent(appBundleId)}/aliases/${encodeURIComponent(alias)}`, {
      version,
    });
  }
  if (!aliasRes.ok) {
    throw new Error(`appbundle alias failed: ${aliasRes.status} ${JSON.stringify(aliasRes.json)}`);
  }
  console.log("   AppBundle OK:", qualifiedBundle);

  console.log("4) Activity…");
  const commandLine = `$(engine.path)\\\\revitcoreconsole.exe /i "$(args[inputFile].path)" /al "$(appbundles[${appBundleId}].path)"`;
  const activityBody = {
    id: activityId,
    commandLine: [commandLine],
    engine,
    appbundles: [qualifiedBundle],
    parameters: {
      inputFile: {
        verb: "get",
        description: "Input RVT",
        required: true,
        localName: "input.rvt",
      },
      outputFile: {
        verb: "put",
        description: "Extracted JSON",
        required: true,
        localName: "result.json",
      },
    },
  };
  let createAct = await da(token, "POST", "/activities", activityBody);
  let activityVersion = 1;
  if (!createAct.ok && createAct.status === 409) {
    const { id: _ignored, ...versionBody } = activityBody;
    createAct = await da(token, "POST", `/activities/${encodeURIComponent(activityId)}/versions`, versionBody);
    if (!createAct.ok) {
      throw new Error(`activity version failed: ${createAct.status} ${JSON.stringify(createAct.json)}`);
    }
    activityVersion = createAct.json.version || 1;
    const actAlias = await da(
      token,
      "PATCH",
      `/activities/${encodeURIComponent(activityId)}/aliases/${encodeURIComponent(alias)}`,
      { version: activityVersion },
    );
    if (!actAlias.ok && actAlias.status === 404) {
      const created = await da(token, "POST", `/activities/${encodeURIComponent(activityId)}/aliases`, {
        id: alias,
        version: activityVersion,
      });
      if (!created.ok) {
        throw new Error(`activity alias create failed: ${created.status} ${JSON.stringify(created.json)}`);
      }
    } else if (!actAlias.ok) {
      throw new Error(`activity alias patch failed: ${actAlias.status} ${JSON.stringify(actAlias.json)}`);
    }
  } else if (!createAct.ok) {
    throw new Error(`activity create failed: ${createAct.status} ${JSON.stringify(createAct.json)}`);
  } else {
    const actAlias = await da(token, "POST", `/activities/${encodeURIComponent(activityId)}/aliases`, {
      id: alias,
      version: 1,
    });
    if (!actAlias.ok && actAlias.status !== 409) {
      throw new Error(`activity alias failed: ${actAlias.status} ${JSON.stringify(actAlias.json)}`);
    }
  }

  console.log("\n=== LISTO ===");
  console.log("APS_ACTIVITY_ID=" + qualifiedActivity);
  setEnvKey(envPath, "APS_ACTIVITY_ID", qualifiedActivity);
  setEnvKey(envPath, "APS_OUTPUT_ARGUMENT", "outputFile");
  setEnvKey(envPath, "APS_INPUT_ARGUMENT", "inputFile");
  setEnvKey(envPath, "APS_INPUT_OBJECT_KEY", "singleRoom.rvt");
  setEnvKey(envPath, "APS_OUTPUT_FILE_NAME", "result.json");
  setEnvKey(envPath, "APS_ENGINE", engine);
  console.log("Guardado en .env");
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

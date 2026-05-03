import { GoogleAuth } from 'google-auth-library';
import * as soap from 'soap';

export const GAM_VERSION = 'v202402';
export const GAM_NAMESPACE = `https://www.google.com/apis/ads/publisher/${GAM_VERSION}`;
const WSDL_BASE = `https://ads.google.com/apis/ads/publisher/${GAM_VERSION}`;
const GAM_SCOPE = 'https://www.googleapis.com/auth/dfp';

export type GamAuth = GoogleAuth;

export function makeAuth(credentials?: { client_email: string; private_key: string }): GoogleAuth {
  return new GoogleAuth({
    scopes: [GAM_SCOPE],
    // If credentials provided (from GAM_CREDENTIALS_JSON), use them explicitly.
    // Otherwise GoogleAuth falls back to Application Default Credentials
    // (set up via: gcloud auth application-default login --scopes=GAM_SCOPE)
    ...(credentials ? { credentials } : {}),
  });
}

async function getToken(auth: GoogleAuth): Promise<string> {
  const token = await auth.getAccessToken();
  if (!token) throw new Error('Failed to obtain Google access token — run: gcloud auth application-default login --scopes=https://www.googleapis.com/auth/dfp');
  return token;
}

export async function createSoapClient(
  service: string,
  networkCode: string,
  auth: GoogleAuth,
  cache: Map<string, soap.Client>
): Promise<soap.Client> {
  if (cache.has(service)) {
    const cached = cache.get(service)!;
    cached.setSecurity(new soap.BearerSecurity(await getToken(auth)));
    return cached;
  }

  const client = await soap.createClientAsync(`${WSDL_BASE}/${service}?wsdl`);

  client.addSoapHeader(
    { RequestHeader: { networkCode, applicationName: 'ADam/0.1.0' } },
    '',
    'ns1',
    GAM_NAMESPACE
  );

  client.setSecurity(new soap.BearerSecurity(await getToken(auth)));
  cache.set(service, client);
  return client;
}

export async function soapCall<T>(
  client: soap.Client,
  method: string,
  args: unknown
): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result] = await (client as any)[`${method}Async`](args);
  return result as T;
}

import { JWT } from 'google-auth-library';
import * as soap from 'soap';

export const GAM_VERSION = 'v202402';
export const GAM_NAMESPACE = `https://www.google.com/apis/ads/publisher/${GAM_VERSION}`;
const WSDL_BASE = `https://ads.google.com/apis/ads/publisher/${GAM_VERSION}`;

export function makeAuth(clientEmail: string, privateKey: string): JWT {
  return new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/dfp'],
  });
}

export async function createSoapClient(
  service: string,
  networkCode: string,
  auth: JWT,
  cache: Map<string, soap.Client>
): Promise<soap.Client> {
  if (cache.has(service)) {
    const cached = cache.get(service)!;
    const { token } = await auth.getAccessToken();
    cached.setSecurity(new soap.BearerSecurity(token!));
    return cached;
  }

  const client = await soap.createClientAsync(`${WSDL_BASE}/${service}?wsdl`);

  client.addSoapHeader(
    { RequestHeader: { networkCode, applicationName: 'ADam/0.1.0' } },
    '',
    'ns1',
    GAM_NAMESPACE
  );

  const { token } = await auth.getAccessToken();
  client.setSecurity(new soap.BearerSecurity(token!));

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

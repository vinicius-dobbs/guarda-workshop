import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { VCSDK } from '@br.gov.dataprev.inji/wallet-sdk';
import { PENDING_KEY } from './deepLinkHandler';
import { isWorkshopMode } from './workshopIssuer';

interface ResolvedCredential {
  inputDescriptorId: string;
  credentialTypeId: string;
  type: string;
  name: string;
  system: string;
  issuerId: string;
}

interface PendingShare {
  shareUrl: string;
  origin?: string;
  requestId?: string;
}

function extractTypeFromDescriptor(descriptor: any): string {
  return (
    descriptor.constraints?.fields
      ?.find((f: any) => f.path?.includes('$.type'))
      ?.filter?.pattern ?? descriptor.id
  );
}

// Caso adicionar novas credenciais, deve alterar aqui, para ficar dinâmico
function resolveCredentials(requestedCredentials: ResolvedCredential[], authRequest: any): ResolvedCredential[] {
  if (requestedCredentials.length > 0) return requestedCredentials;

  const descriptors: any[] = authRequest.presentation_definition?.input_descriptors ?? [];
  return descriptors.map((d) => ({
    inputDescriptorId: d.id,
    credentialTypeId: d.id,
    type: extractTypeFromDescriptor(d),
    name: d.name || d.id,
    system: 'MGI',
    issuerId: 'MGI',
  }));
}

async function downloadMissingCredentials(credentials: ResolvedCredential[]): Promise<void> {
  const { successCount, error424Count, realErrorCount } =
    await VCSDK.share.downloadCredentials(credentials);

  if (successCount === 0)
    throw new Error(`Download falhou. 424s: ${error424Count}, erros: ${realErrorCount}`);
}

function hasUsableCredential(existing: any[], requested: ResolvedCredential[]): boolean {
  if (requested.length === 0) return false;
  return requested.every(({ type, credentialTypeId }) => existing.some((vc) => {
    const types: string[] = Array.isArray(vc.type) ? vc.type : [vc.type];
    const matchesType = types.includes(type) || vc.metadata?.credentialType?.id === credentialTypeId;
    if (!matchesType) return false;
    if (vc.expirationDate && !(new Date(vc.expirationDate).getTime() > Date.now())) return false;
    return true;
  }));
}

async function sendPresentation(authRequest: any, credentials: ResolvedCredential[], pending: PendingShare): Promise<void> {
  const result = await VCSDK.share.completeShare(authRequest, credentials);
  if (!result.success) throw new Error('Não foi possível enviar a apresentação ao verificador.');
  await AsyncStorage.removeItem(PENDING_KEY);

  if (pending.origin) {
    try {
      await Linking.openURL(pending.origin);
    } catch {}
  }
}

export async function executeShare(pending: PendingShare): Promise<void> {
  const { requestedCredentials, authRequest } = await VCSDK.share.parseRequest(pending.shareUrl);
  const credentials = resolveCredentials(requestedCredentials, authRequest);

  if (isWorkshopMode) {
    const existing = await VCSDK.credentials.getAll();
    if (!hasUsableCredential(existing, credentials)) {
      throw new Error('Credencial da oficina não disponível ou expirada. Baixe-a na carteira antes de compartilhar.');
    }
  } else {
    await downloadMissingCredentials(credentials);
  }
  await sendPresentation(authRequest, credentials, pending);
}

export async function declineShare(origin?: string): Promise<void> {
  VCSDK.share.declineShare();
  await AsyncStorage.removeItem(PENDING_KEY);
  if (origin) await Linking.openURL(`${origin}?verified=false`);
}

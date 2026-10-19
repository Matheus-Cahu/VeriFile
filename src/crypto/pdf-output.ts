// Saída das credenciais emitidas: emissão + PDF verificável e gravação dos
// PDFs em disco. Compartilhado pelas telas de assinatura (signing.tsx) e de
// credenciais pendentes (pendentes.tsx).
import { Platform } from 'react-native';
import {
  cacheDirectory,
  documentDirectory,
  StorageAccessFramework,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import { credentialToPdfBase64, issueCredential } from './keys';
import type { StoredIdentity } from '../wallet/WalletDatabase';

export type PdfSaver = {
  /** Grava o PDF e retorna o nome/caminho do arquivo. */
  save: (fileName: string, base64: string) => Promise<string>;
  /** Onde os arquivos foram parar, para a mensagem final. */
  location: string;
};

// Escolhe onde salvar os PDFs. No Android usa o Storage Access Framework para
// o usuário escolher a pasta (ex.: Downloads) — um "download" de verdade. A
// pasta é escolhida uma vez só, mesmo num lote. Retorna null se cancelado.
export async function pickPdfSaver(): Promise<PdfSaver | null> {
  if (Platform.OS === 'android') {
    const perm =
      await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) return null;
    return {
      location: 'pasta escolhida',
      save: async (fileName, base64) => {
        const uri = await StorageAccessFramework.createFileAsync(
          perm.directoryUri,
          fileName,
          'application/pdf'
        );
        await writeAsStringAsync(uri, base64, { encoding: 'base64' });
        return `${fileName}.pdf`;
      },
    };
  }

  // iOS/outros: grava na pasta do app (sandbox) e informa o caminho.
  const dir = documentDirectory ?? cacheDirectory ?? '';
  return {
    location: dir,
    save: async (fileName, base64) => {
      const fileUri = `${dir}${fileName}.pdf`;
      await writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
      return fileUri;
    },
  };
}

// Emite uma credencial e gera o PDF verificável correspondente.
export async function issueWithPdf(
  identity: StoredIdentity,
  attributes: Record<string, unknown>,
  options?: Parameters<typeof issueCredential>[3]
) {
  const issued = await issueCredential(
    identity.did_document,
    identity.mldsa_private_key,
    attributes,
    options
  );
  const labels = Object.fromEntries(
    Object.keys(attributes).map((key) => [`subject.${key}`, key])
  );
  const pdfBase64 = await credentialToPdfBase64(
    issued.signedCredential,
    identity.did_document,
    identity.mldsa_private_key,
    labels
  );
  return { ...issued, pdfBase64 };
}


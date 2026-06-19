import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { CheckCircle2, FileUp, XCircle } from 'lucide-react-native';

import {
  extractIssuerDidFromPdf,
  verifyCredentialPdf,
  type PdfVerification,
} from '../crypto/keys';
import { getIdentityByDid } from '../wallet/WalletDatabase';
import { Colors, Spacing } from '@/constants/theme';

export default function Verify() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [verification, setVerification] = useState<PdfVerification | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function pickAndVerify() {
    setBusy(true);
    setVerification(null);
    setMessage(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) {
        setBusy(false);
        return;
      }

      const asset = res.assets[0];
      setFileName(asset.name ?? 'credencial.pdf');

      const bytes = await new File(asset.uri).arrayBuffer();

      const issuerDid = extractIssuerDidFromPdf(bytes);
      if (!issuerDid) {
        setMessage(
          'Este PDF não contém um manifesto SSI — não é uma credencial verificável.'
        );
        return;
      }

      const identity = await getIdentityByDid(issuerDid);
      if (!identity) {
        setMessage(
          `Emissor não está nesta carteira, então não há DID Document para verificar.\nDID do emissor: ${issuerDid}`
        );
        return;
      }

      setVerification(verifyCredentialPdf(bytes, identity.did_document));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Carregue o PDF de uma credencial para verificar a assinatura e a
        integridade do vínculo PDF↔credencial.
      </Text>

      <Pressable
        onPress={pickAndVerify}
        disabled={busy}
        style={[styles.pickBtn, { opacity: busy ? 0.6 : 1 }]}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <FileUp size={20} color="#FFFFFF" />
            <Text style={styles.pickBtnText}>Carregar PDF da credencial</Text>
          </>
        )}
      </Pressable>

      {fileName && (
        <Text style={[styles.fileName, { color: c.textSecondary }]} numberOfLines={1}>
          {fileName}
        </Text>
      )}

      {message && (
        <View style={[styles.messageBox, { backgroundColor: c.backgroundElement }]}>
          <Text style={[styles.messageText, { color: c.text }]}>{message}</Text>
        </View>
      )}

      {verification && (
        <View style={styles.resultBox}>
          <View style={styles.verdictRow}>
            {verification.valid ? (
              <CheckCircle2 size={26} color="#22C55E" />
            ) : (
              <XCircle size={26} color="#EF4444" />
            )}
            <Text
              style={[
                styles.verdictText,
                { color: verification.valid ? '#22C55E' : '#EF4444' },
              ]}
            >
              {verification.valid
                ? 'Credencial válida'
                : 'Credencial inválida'}
            </Text>
          </View>

          <Check label="Assinatura da credencial" ok={verification.credentialSignatureValid} c={c} />
          <Check label="Assinatura do vínculo PDF↔credencial" ok={verification.documentBindingSignatureValid} c={c} />
          <Check label="Hash do PDF-base confere" ok={verification.pdfBaseHashValid} c={c} />
          <Check label="DID Document e chave conferem" ok={verification.didKeyMatch} c={c} />

          {verification.issuerDid && (
            <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
              Emissor: {verification.issuerDid}
            </Text>
          )}
          {verification.credentialId && (
            <Text style={[styles.meta, { color: c.textSecondary }]} numberOfLines={1}>
              Credencial: {verification.credentialId}
            </Text>
          )}

          {verification.errors.length > 0 && (
            <Text style={[styles.errors, { color: '#EF4444' }]}>
              Erros: {verification.errors.join(', ')}
            </Text>
          )}

          <Text
            style={[styles.json, { backgroundColor: c.backgroundElement, color: c.text }]}
            selectable
          >
            {verification.raw}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

function Check({
  label,
  ok,
  c,
}: {
  label: string;
  ok: boolean;
  c: typeof Colors.light | typeof Colors.dark;
}) {
  return (
    <View style={styles.checkRow}>
      {ok ? (
        <CheckCircle2 size={18} color="#22C55E" />
      ) : (
        <XCircle size={18} color="#EF4444" />
      )}
      <Text style={[styles.checkLabel, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  hint: {
    fontSize: 14,
  },
  pickBtn: {
    backgroundColor: '#0D3654',
    borderRadius: 14,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  pickBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  fileName: {
    fontSize: 13,
    fontFamily: 'monospace',
  },
  messageBox: {
    borderRadius: 10,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  messageText: {
    fontSize: 14,
  },
  resultBox: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  verdictText: {
    fontSize: 20,
    fontWeight: '800',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  checkLabel: {
    fontSize: 14,
    flex: 1,
  },
  meta: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: Spacing.one,
  },
  errors: {
    fontSize: 13,
    fontWeight: '600',
  },
  json: {
    fontFamily: 'monospace',
    fontSize: 11,
    borderRadius: 10,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
});

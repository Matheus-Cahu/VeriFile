// Tela "Credenciais pendentes": busca as ofertas PENDING do holder no backend
// (rota /api/mobile/credenciais/pendentes) e permite assiná-las localmente com
// um DID da carteira — mesmo motor de assinatura da tela signing.tsx (ML-DSA via
// core SSI-PQ), gerando a VC assinada e o PDF verificável.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { CheckCircle2, FileSignature, Inbox, RefreshCw } from 'lucide-react-native';

import {
  cacheDirectory,
  documentDirectory,
  StorageAccessFramework,
  writeAsStringAsync,
} from 'expo-file-system/legacy';

import { credentialToPdfBase64, issueCredential } from '../crypto/keys';
import { getIdentity, listDIDs, type DidSummary } from '../wallet/WalletDatabase';
import {
  extractCredentialAttributes,
  fetchPendingCredentials,
  type PendingCredential,
} from '../auth/pending-credentials';
import { useAuth } from '../auth/auth-context';
import { Colors, Spacing } from '@/constants/theme';

// Salva o PDF (base64) num arquivo. No Android usa o Storage Access Framework
// para o usuário escolher a pasta (ex.: Downloads). Igual à tela signing.tsx.
async function downloadPdf(base64: string, fileName: string) {
  if (Platform.OS === 'android') {
    const perm = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('PDF não salvo', 'Nenhuma pasta foi escolhida.');
      return;
    }
    const uri = await StorageAccessFramework.createFileAsync(
      perm.directoryUri,
      fileName,
      'application/pdf'
    );
    await writeAsStringAsync(uri, base64, { encoding: 'base64' });
    Alert.alert('PDF salvo', `${fileName}.pdf`);
    return;
  }

  const fileUri = `${documentDirectory ?? cacheDirectory ?? ''}${fileName}.pdf`;
  await writeAsStringAsync(fileUri, base64, { encoding: 'base64' });
  Alert.alert('PDF salvo', fileUri);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('pt-BR');
}

export default function PendingCredentialsScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { user } = useAuth();

  const [credentials, setCredentials] = useState<PendingCredential[]>([]);
  const [identities, setIdentities] = useState<DidSummary[]>([]);
  const [selectedDid, setSelectedDid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // id da credencial sendo assinada no momento (para o spinner do botão).
  const [signingId, setSigningId] = useState<string | null>(null);
  // ids já assinados nesta sessão (marca visual de concluído).
  const [signedIds, setSignedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const idToken = user?.idToken;
      if (!idToken) throw new Error('Sessão sem idToken — faça login novamente.');
      const list = await fetchPendingCredentials(idToken);
      setCredentials(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCredentials([]);
    }
  }, [user?.idToken]);

  // Carrega DIDs da carteira (para escolher quem assina) e as ofertas pendentes.
  useEffect(() => {
    listDIDs().then((list) => {
      setIdentities(list);
      setSelectedDid((prev) => prev ?? list[0]?.id ?? null);
    });
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load().finally(() => setRefreshing(false));
  }, [load]);

  async function handleSign(credential: PendingCredential) {
    if (!selectedDid) {
      Alert.alert('Selecione um DID', 'Crie ou escolha um DID na carteira para assinar.');
      return;
    }

    const attributes = extractCredentialAttributes(credential.vcPayload);
    if (Object.keys(attributes).length === 0) {
      Alert.alert('Oferta sem atributos', 'Esta credencial não tem credentialSubject para assinar.');
      return;
    }

    setSigningId(credential.id);
    try {
      const identity = await getIdentity(selectedDid);
      if (!identity) throw new Error('Identidade não encontrada na carteira.');

      const issued = await issueCredential(
        identity.did_document,
        identity.mldsa_private_key,
        attributes
      );

      // Gera o PDF verificável da credencial assinada e baixa para uma pasta.
      const labels = Object.fromEntries(
        Object.keys(attributes).map((key) => [`subject.${key}`, key])
      );
      const pdfBase64 = await credentialToPdfBase64(
        issued.signedCredential,
        identity.did_document,
        identity.mldsa_private_key,
        labels
      );
      await downloadPdf(pdfBase64, `credencial-${credential.id}`);

      setSignedIds((prev) => new Set(prev).add(credential.id));
      Alert.alert(
        issued.verified ? 'Credencial assinada' : 'Assinada com aviso',
        issued.verified
          ? 'A credencial foi assinada e verificada com sucesso.'
          : 'A credencial foi assinada, mas a verificação local falhou.'
      );
    } catch (err) {
      Alert.alert(
        'Falha ao assinar',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSigningId(null);
    }
  }

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: c.background }]}>
        <ActivityIndicator color={c.text} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.text} />
      }
    >
      {/* Seletor de DID assinante */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>DID assinante</Text>
      {identities.length === 0 ? (
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Nenhum DID na carteira. Crie um DID na tela inicial primeiro.
        </Text>
      ) : (
        <View style={styles.chips}>
          {identities.map((item) => {
            const active = item.id === selectedDid;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSelectedDid(item.id)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active
                      ? c.backgroundSelected
                      : c.backgroundElement,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: c.text }]} numberOfLines={1}>
                  {item.did.slice(0, 24)}…
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* Erro de rede/backend */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={onRefresh} style={styles.retryBtn}>
            <RefreshCw size={14} color="#FFFFFF" />
            <Text style={styles.retryText}>Tentar novamente</Text>
          </Pressable>
        </View>
      )}

      {/* Lista de ofertas pendentes */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>
        Ofertas pendentes {credentials.length > 0 ? `(${credentials.length})` : ''}
      </Text>

      {!error && credentials.length === 0 ? (
        <View style={styles.empty}>
          <Inbox size={32} color={c.textSecondary} />
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            Nenhuma credencial pendente.
          </Text>
        </View>
      ) : (
        credentials.map((credential) => {
          const attributes = extractCredentialAttributes(credential.vcPayload);
          const signed = signedIds.has(credential.id);
          const busy = signingId === credential.id;
          return (
            <View
              key={credential.id}
              style={[styles.card, { backgroundColor: c.backgroundElement }]}
            >
              <Text style={[styles.cardTitle, { color: c.text }]}>
                {credential.schema.name}
                <Text style={[styles.cardVersion, { color: c.textSecondary }]}>
                  {'  '}v{credential.schema.version}
                </Text>
              </Text>
              <Text style={[styles.cardMeta, { color: c.textSecondary }]}>
                Emitida por {credential.issuer.name ?? credential.issuer.email ?? 'issuer'} ·{' '}
                {formatDate(credential.issuedAt)}
              </Text>

              {/* Atributos da oferta */}
              <View style={styles.attrs}>
                {Object.entries(attributes).map(([key, value]) => (
                  <View key={key} style={styles.attrRow}>
                    <Text style={[styles.attrKey, { color: c.textSecondary }]}>{key}</Text>
                    <Text style={[styles.attrValue, { color: c.text }]} numberOfLines={2}>
                      {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                    </Text>
                  </View>
                ))}
                {Object.keys(attributes).length === 0 && (
                  <Text style={[styles.hint, { color: c.textSecondary }]}>
                    Oferta sem atributos legíveis.
                  </Text>
                )}
              </View>

              <Pressable
                onPress={() => handleSign(credential)}
                disabled={busy || signed}
                style={[
                  styles.signBtn,
                  { backgroundColor: signed ? '#22C55E' : '#0D3654', opacity: busy ? 0.6 : 1 },
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : signed ? (
                  <>
                    <CheckCircle2 size={18} color="#FFFFFF" />
                    <Text style={styles.signBtnText}>Assinada</Text>
                  </>
                ) : (
                  <>
                    <FileSignature size={18} color="#FFFFFF" />
                    <Text style={styles.signBtnText}>Assinar credencial</Text>
                  </>
                )}
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.two,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: Spacing.two,
  },
  hint: {
    fontSize: 14,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chipText: {
    fontSize: 13,
    fontFamily: 'monospace',
    maxWidth: 220,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    backgroundColor: '#B91C1C',
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  cardVersion: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardMeta: {
    fontSize: 12,
  },
  attrs: {
    gap: Spacing.one,
    marginTop: Spacing.one,
  },
  attrRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  attrKey: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 90,
  },
  attrValue: {
    fontSize: 13,
    flex: 1,
  },
  signBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: 14,
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  signBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

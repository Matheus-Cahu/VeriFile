// Tela "Credenciais pendentes": busca as ofertas PENDING do holder no backend
// (rota /api/mobile/credenciais/pendentes) e permite assiná-las localmente com
// um DID da carteira — mesmo motor de assinatura da tela signing.tsx (ML-DSA via
// core SSI-PQ), gerando a VC assinada e o PDF verificável. Várias ofertas podem
// ser marcadas e assinadas de uma vez, como um lote (mesmo batch_id).
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {
  CheckCircle2,
  CheckSquare,
  FileSignature,
  Inbox,
  RefreshCw,
  Square,
} from 'lucide-react-native';
import { randomUUID } from 'expo-crypto';

import { BATCH_REF_TYPE } from '../crypto/keys';
import { issueWithPdf, pickPdfSaver } from '../crypto/pdf-output';
import { getIdentity, listDIDs, type DidSummary } from '../wallet/WalletDatabase';
import {
  extractCredentialAttributes,
  fetchPendingCredentials,
  markCredentialSigned,
  type PendingCredential,
} from '../auth/pending-credentials';
import { useAuth } from '../auth/auth-context';
import { Colors, Spacing } from '@/constants/theme';

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
  // ids marcados para assinatura em lote.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Progresso do lote em andamento ("2/5"); null quando não há lote rodando.
  const [batchProgress, setBatchProgress] = useState<string | null>(null);

  // Só ofertas ainda não assinadas e com atributos podem entrar no lote.
  const selectable = useMemo(
    () =>
      credentials.filter(
        (cred) =>
          !signedIds.has(cred.id) &&
          Object.keys(extractCredentialAttributes(cred.vcPayload)).length > 0
      ),
    [credentials, signedIds]
  );
  const selected = selectable.filter((cred) => selectedIds.has(cred.id));
  const allSelected = selectable.length > 0 && selected.length === selectable.length;
  const anyBusy = signingId !== null || batchProgress !== null;

  function idToken(): string {
    if (!user?.idToken) throw new Error('Sessão sem idToken — faça login novamente.');
    return user.idToken;
  }

  const load = useCallback(async () => {
    setError(null);
    try {
      const idToken = user?.idToken;
      if (!idToken) throw new Error('Sessão sem idToken — faça login novamente.');
      const list = await fetchPendingCredentials(idToken);
      setCredentials(list);
      // Descarta marcações de ofertas que não vieram mais na lista.
      setSelectedIds((prev) => {
        const ids = new Set(list.map((cred) => cred.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
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

      // Pasta escolhida antes de assinar: depois que a plataforma marca a VC
      // como assinada, o PDF não pode ficar sem destino.
      const saver = await pickPdfSaver();
      if (!saver) {
        Alert.alert('Nada foi assinado', 'Nenhuma pasta foi escolhida para o PDF.');
        return;
      }

      const issued = await issueWithPdf(identity, attributes);
      if (!issued.verified) {
        throw new Error('A verificação local da credencial assinada falhou.');
      }

      // Atualiza o status na plataforma (PENDING → ACTIVE) e só então salva o
      // PDF: se o backend recusar, nenhuma credencial "solta" fica no aparelho.
      await markCredentialSigned(idToken(), credential.id, issued.pdfBase64);
      setSignedIds((prev) => new Set(prev).add(credential.id));

      const file = await saver.save(`credencial-${credential.id}`, issued.pdfBase64);
      Alert.alert('Credencial assinada', `Status atualizado na plataforma.\nPDF salvo: ${file}`);
    } catch (err) {
      Alert.alert(
        'Falha ao assinar',
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setSigningId(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(selectable.map((cred) => cred.id)));
  }

  // Assina as ofertas marcadas como um lote: mesmo batch_id e issued_at em
  // todas (gravados na parte assinada da credencial, ver BatchRef em keys.tsx)
  // e uma única escolha de pasta para os PDFs.
  async function handleSignSelected() {
    if (!selectedDid) {
      Alert.alert('Selecione um DID', 'Crie ou escolha um DID na carteira para assinar.');
      return;
    }
    if (selected.length === 0) return;

    const batch = selected;
    const batchId = randomUUID();
    const issuedAt = new Date().toISOString();
    let done = 0;

    setBatchProgress(`0/${batch.length}`);
    try {
      const token = idToken();
      const identity = await getIdentity(selectedDid);
      if (!identity) throw new Error('Identidade não encontrada na carteira.');

      const saver = await pickPdfSaver();
      if (!saver) {
        Alert.alert('Nada foi assinado', 'Nenhuma pasta foi escolhida para os PDFs.');
        return;
      }

      for (let i = 0; i < batch.length; i++) {
        const credential = batch[i];
        setBatchProgress(`${i + 1}/${batch.length}`);
        setSigningId(credential.id);
        const issued = await issueWithPdf(
          identity,
          extractCredentialAttributes(credential.vcPayload),
          {
            issuedAt,
            batch: {
              type: BATCH_REF_TYPE,
              batch_id: batchId,
              index: i + 1,
              total: batch.length,
            },
          }
        );
        if (!issued.verified) {
          throw new Error(`Verificação local falhou em "${credential.schema.name}".`);
        }
        await markCredentialSigned(token, credential.id, issued.pdfBase64);
        done++;
        setSignedIds((prev) => new Set(prev).add(credential.id));
        await saver.save(`credencial-${credential.id}`, issued.pdfBase64);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(credential.id);
          return next;
        });
      }

      Alert.alert(
        `${done} credencia${done > 1 ? 'is assinadas' : 'l assinada'}`,
        `Lote ${batchId}\nPDFs salvos em ${saver.location}.` +
          '\nStatus atualizado na plataforma.'
      );
    } catch (err) {
      Alert.alert(
        'Falha ao assinar lote',
        `${err instanceof Error ? err.message : String(err)}\n\n` +
          `${done} de ${batch.length} foram assinadas antes da falha (lote ${batchId}).`
      );
    } finally {
      setSigningId(null);
      setBatchProgress(null);
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
      <View style={styles.listHeader}>
        <Text style={[styles.sectionTitle, { color: c.text }]}>
          Ofertas pendentes {credentials.length > 0 ? `(${credentials.length})` : ''}
        </Text>
        {selectable.length > 0 && (
          <Pressable onPress={toggleAll} disabled={anyBusy} style={styles.selectAll}>
            {allSelected ? (
              <CheckSquare size={18} color={c.text} />
            ) : (
              <Square size={18} color={c.textSecondary} />
            )}
            <Text style={[styles.selectAllText, { color: c.text }]}>
              {allSelected ? 'Desmarcar todas' : 'Marcar todas'}
            </Text>
          </Pressable>
        )}
      </View>

      {selected.length > 0 && (
        <Pressable
          onPress={handleSignSelected}
          disabled={anyBusy}
          style={[styles.signBtn, styles.batchBtn, { opacity: anyBusy ? 0.6 : 1 }]}
        >
          {batchProgress ? (
            <>
              <ActivityIndicator color="#FFFFFF" />
              <Text style={styles.signBtnText}>Assinando {batchProgress}…</Text>
            </>
          ) : (
            <>
              <FileSignature size={18} color="#FFFFFF" />
              <Text style={styles.signBtnText}>
                Assinar selecionadas ({selected.length})
              </Text>
            </>
          )}
        </Pressable>
      )}

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
          const canSelect = selectable.includes(credential);
          const checked = selectedIds.has(credential.id);
          return (
            <View
              key={credential.id}
              style={[
                styles.card,
                { backgroundColor: c.backgroundElement },
                checked && styles.cardChecked,
              ]}
            >
              <Pressable
                onPress={() => toggleSelected(credential.id)}
                disabled={!canSelect || anyBusy}
                style={styles.cardHeader}
              >
                {canSelect &&
                  (checked ? (
                    <CheckSquare size={20} color={c.text} />
                  ) : (
                    <Square size={20} color={c.textSecondary} />
                  ))}
                <Text style={[styles.cardTitle, { color: c.text }]}>
                  {credential.schema.name}
                  <Text style={[styles.cardVersion, { color: c.textSecondary }]}>
                    {'  '}v{credential.schema.version}
                  </Text>
                </Text>
              </Pressable>
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
                disabled={anyBusy || signed}
                style={[
                  styles.signBtn,
                  {
                    backgroundColor: signed ? '#22C55E' : '#0D3654',
                    opacity: anyBusy && !signed ? 0.6 : 1,
                  },
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
  cardChecked: {
    borderWidth: 2,
    borderColor: '#0D3654',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    marginTop: Spacing.two,
    paddingVertical: Spacing.one,
  },
  selectAllText: {
    fontSize: 14,
    fontWeight: '600',
  },
  batchBtn: {
    backgroundColor: '#0D3654',
    marginTop: 0,
  },
  cardTitle: {
    flex: 1,
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

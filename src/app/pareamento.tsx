// Tela "Parear com a plataforma": lê o QR Code do desafio exibido em /settings
// na plataforma web (ou o JSON colado), assina o desafio com o DID da carteira
// (ML-DSA via core SSI-PQ) e conclui o pareamento — ver src/auth/did-pairing.ts.
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { CheckCircle2, ClipboardPaste, Link2, QrCode, X } from 'lucide-react-native';

import {
  completePairing,
  loadPairing,
  parsePairingPayload,
  type PairingChallenge,
  type PairingRecord,
} from '../auth/did-pairing';
import { useAuth } from '../auth/auth-context';
import { createPqIdentity } from '../crypto/keys';
import { getIdentity, listDIDs, saveIdentity, type DidSummary } from '../wallet/WalletDatabase';
import { Colors, Spacing } from '@/constants/theme';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
}

export default function PairingScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];
  const { user } = useAuth();
  const [permission, requestPermission] = useCameraPermissions();

  const [pairing, setPairing] = useState<PairingRecord | null>(null);
  const [identities, setIdentities] = useState<DidSummary[]>([]);
  const [selectedDid, setSelectedDid] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<PairingChallenge | null>(null);
  const [scanning, setScanning] = useState(false);
  const [pasted, setPasted] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // O scanner dispara onBarcodeScanned várias vezes por segundo: trava após a
  // primeira leitura para não processar o mesmo QR repetidamente.
  const scanLock = useRef(false);

  const loadIdentities = useCallback(async () => {
    const list = await listDIDs();
    setIdentities(list);
    setSelectedDid((prev) => prev ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadIdentities();
    if (user?.email) loadPairing(user.email).then(setPairing).catch(() => {});
  }, [loadIdentities, user?.email]);

  function acceptPayload(raw: string) {
    try {
      setChallenge(parsePairingPayload(raw));
      setError(null);
      setScanning(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function onBarcodeScanned(result: BarcodeScanningResult) {
    if (scanLock.current) return;
    scanLock.current = true;
    acceptPayload(result.data);
  }

  async function startScan() {
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        Alert.alert('Câmera negada', 'Permita o acesso à câmera ou cole o código do desafio.');
        return;
      }
    }
    scanLock.current = false;
    setError(null);
    setScanning(true);
  }

  async function handleCreateDid() {
    setBusy(true);
    try {
      await saveIdentity({ id: `did-${Date.now()}`, identity: await createPqIdentity() });
      await loadIdentities();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm() {
    if (!challenge || !selectedDid || !user) return;
    setBusy(true);
    setError(null);
    try {
      const identity = await getIdentity(selectedDid);
      if (!identity) throw new Error('Identidade não encontrada na carteira.');
      const record = await completePairing({
        challenge,
        identity,
        account: { email: user.email, idToken: user.idToken, backendUserId: user.backend?.id },
      });
      setPairing(record);
      setChallenge(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  // ── Já pareado ──────────────────────────────────────────
  if (pairing) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, { backgroundColor: c.backgroundElement }]}>
          <View style={styles.row}>
            <CheckCircle2 size={22} color="#22C55E" />
            <Text style={[styles.cardTitle, { color: c.text }]}>DID pareado</Text>
          </View>
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            Conta {pairing.email} · {formatDateTime(pairing.pairedAt)}
          </Text>
          <Text style={[styles.mono, { color: c.text }]} selectable>
            {pairing.did}
          </Text>
        </View>
        <Text style={[styles.hint, { color: c.textSecondary }]}>
          Para trocar o DID, a plataforma precisa primeiro desfazer o pareamento atual.
        </Text>
      </ScrollView>
    );
  }

  // ── Leitura do QR ───────────────────────────────────────
  if (scanning) {
    return (
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onBarcodeScanned}
        />
        <View style={styles.cameraOverlay}>
          <Text style={styles.cameraText}>
            Aponte para o QR Code em Configurações → Pareamento na plataforma
          </Text>
          {error && <Text style={styles.cameraError}>{error}</Text>}
          <View style={styles.row}>
            {error && (
              <Pressable
                style={styles.cameraBtn}
                onPress={() => {
                  scanLock.current = false;
                  setError(null);
                }}>
                <QrCode size={18} color="#FFFFFF" />
                <Text style={styles.btnText}>Ler novamente</Text>
              </Pressable>
            )}
            <Pressable style={styles.cameraBtn} onPress={() => setScanning(false)}>
              <X size={18} color="#FFFFFF" />
              <Text style={styles.btnText}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  // ── Fluxo de pareamento ─────────────────────────────────
  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={[styles.hint, { color: c.textSecondary }]}>
        Vincule o DID desta carteira à sua conta na plataforma. Na web, abra
        Configurações, inicie o pareamento e leia o QR Code exibido.
      </Text>

      {/* 1. DID a parear */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>1. DID da carteira</Text>
      {identities.length === 0 ? (
        <Pressable
          onPress={handleCreateDid}
          disabled={busy}
          style={[styles.primaryBtn, { opacity: busy ? 0.6 : 1 }]}>
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.btnText}>Criar DID pós-quântico</Text>
          )}
        </Pressable>
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
                  { backgroundColor: active ? c.backgroundSelected : c.backgroundElement },
                ]}>
                <Text style={[styles.chipText, { color: c.text }]} numberOfLines={1}>
                  {item.did.slice(0, 24)}…
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {/* 2. Desafio da plataforma */}
      <Text style={[styles.sectionTitle, { color: c.text }]}>2. Desafio da plataforma</Text>
      {challenge ? (
        <View style={[styles.card, { backgroundColor: c.backgroundElement }]}>
          <View style={styles.row}>
            <QrCode size={20} color={c.text} />
            <Text style={[styles.cardTitle, { color: c.text }]}>Desafio lido</Text>
          </View>
          {challenge.email && (
            <Text style={[styles.hint, { color: c.textSecondary }]}>Conta: {challenge.email}</Text>
          )}
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            Expira em {formatDateTime(challenge.expiresAt)}
          </Text>
          <Pressable onPress={() => setChallenge(null)}>
            <Text style={[styles.link, { color: c.textSecondary }]}>Ler outro código</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable onPress={startScan} style={styles.primaryBtn}>
            <QrCode size={18} color="#FFFFFF" />
            <Text style={styles.btnText}>Ler QR Code</Text>
          </Pressable>
          <TextInput
            value={pasted}
            onChangeText={setPasted}
            placeholder='Ou cole o JSON do desafio ({"pairingId": …})'
            placeholderTextColor={c.textSecondary}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: c.text, backgroundColor: c.backgroundElement }]}
          />
          {pasted.trim().length > 0 && (
            <Pressable
              onPress={() => acceptPayload(pasted)}
              style={[styles.secondaryBtn, { backgroundColor: c.backgroundSelected }]}>
              <ClipboardPaste size={16} color={c.text} />
              <Text style={[styles.secondaryBtnText, { color: c.text }]}>Usar código colado</Text>
            </Pressable>
          )}
        </>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* 3. Confirmação */}
      <Pressable
        onPress={handleConfirm}
        disabled={!challenge || !selectedDid || busy}
        style={[
          styles.primaryBtn,
          styles.confirmBtn,
          { opacity: !challenge || !selectedDid || busy ? 0.5 : 1 },
        ]}>
        {busy && challenge ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Link2 size={18} color="#FFFFFF" />
            <Text style={styles.btnText}>Assinar e parear</Text>
          </>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
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
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  mono: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  link: {
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  input: {
    minHeight: 80,
    borderRadius: 12,
    padding: Spacing.three,
    fontSize: 12,
    fontFamily: 'monospace',
    textAlignVertical: 'top',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: '#0D3654',
    borderRadius: 12,
    paddingVertical: Spacing.three,
  },
  confirmBtn: {
    marginTop: Spacing.three,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    borderRadius: 12,
    paddingVertical: Spacing.two,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    padding: Spacing.three,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 13,
  },
  cameraWrap: {
    flex: 1,
    backgroundColor: '#000000',
  },
  cameraOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cameraText: {
    color: '#FFFFFF',
    fontSize: 14,
    textAlign: 'center',
  },
  cameraError: {
    color: '#FCA5A5',
    fontSize: 13,
    textAlign: 'center',
  },
  cameraBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});

import { StyleSheet, View, Pressable, FlatList, Text, Alert } from 'react-native';
import { CheckCircle2, Copy, Database, ShieldCheck } from 'lucide-react-native';
import { ThemedText } from './themed-text';
import { Spacing } from '@/constants/theme';
import { useEffect, useState } from 'react';
import { generateKeyPair, publicKeyToDIDKey } from '../crypto/keys';
import { saveKeyPair, listDIDs } from '../wallet/WalletDatabase';
//import Clipboard from '@react-native-clipboard/clipboard';

interface DIDRecord {
  id: string;
  did: string;
  public_key: string;
  created_at: number;
}

async function createNewIdentity() {
  const label = `did-${Date.now()}`;
  const keyPair = generateKeyPair();
  const did = publicKeyToDIDKey(keyPair.publicKey);
  await saveKeyPair({
    id: label,
    did,
    privateKeyHex: keyPair.privateKeyHex,
    publicKeyHex: keyPair.publicKeyHex,
  });
  console.log('DID criado:', did);
}

const DID_CARD_BG = '#0D3654';

export function DidCard() {
  const [dids, setDids] = useState<DIDRecord[]>([]);

  useEffect(() => {
    listDIDs().then(setDids);
  }, []);

  return (
    <View style={styles.didCard}>
      <View style={styles.didBadge}>
        <ThemedText style={styles.didBadgeText}>DID</ThemedText>
      </View>

      <View style={styles.didCardTop}>
        <View style={styles.didStatusRow}>
          <ThemedText style={styles.didActiveTitle}>DID ativo</ThemedText>
          <CheckCircle2 size={22} color="#22C55E" />
        </View>
        <View style={styles.didAddressRow}>
          <FlatList
            data={dids}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.didAddress}>{item.did.slice(0,20)+"..."}</Text>
                <Pressable
                  onPress={() => {
                   // Clipboard.setString(item.public_key);
                    Alert.alert('Chave pública copiada', item.public_key);
                  }}>
                  <Copy size={16} color="#A0C4E8" />
                </Pressable>
              </View>
            )}
          />
        </View>
        <ShieldCheck size={72} color="rgba(255,255,255,0.18)" style={styles.didShieldIcon} />
      </View>

      <View style={styles.didCardDivider} />

      <View style={styles.didCardBottom}>
        <Database size={28} color="#A0C4E8" />
        <View style={styles.didWalletInfo}>
          <ThemedText style={styles.didWalletLabel}>Carteira</ThemedText>
          <ThemedText style={styles.didWalletValue}>SQLite cifrado</ThemedText>
        </View>
        <Pressable onPress={async () => {
          if (dids.length === 0) {
            await createNewIdentity();
          } else {
            Alert.alert('Você já possui uma DID');
          }
        }}>
          <View style={styles.didProtectedBadge}>
            <ThemedText style={styles.didProtectedText}>Criar DID</ThemedText>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  didCard: {
    backgroundColor: DID_CARD_BG,
    borderRadius: 20,
    padding: Spacing.three,
    overflow: 'hidden',
  },
  didBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: Spacing.two,
  },
  didBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  didCardTop: {
    position: 'relative',
    marginBottom: Spacing.two,
  },
  didStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  didActiveTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  didAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  didAddress: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontFamily: 'monospace',
  },
  didShieldIcon: {
    position: 'absolute',
    right: -8,
    top: -8,
  },
  didCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: Spacing.two,
  },
  didCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  didWalletInfo: {
    flex: 1,
  },
  didWalletLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    lineHeight: 16,
  },
  didWalletValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  didProtectedBadge: {
    backgroundColor: '#22C55E',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  didProtectedText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});

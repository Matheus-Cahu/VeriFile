import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { CheckCircle2, Plus, Trash2, XCircle } from 'lucide-react-native';

import { issueCredential } from '../crypto/keys';
import { getIdentity, listDIDs, type DidSummary } from '../wallet/WalletDatabase';
import { Colors, Spacing } from '@/constants/theme';

type AttributeRow = { key: string; value: string };

const INITIAL_ROWS: AttributeRow[] = [
  { key: 'nome', value: '' },
  { key: 'documento', value: '' },
];

export default function Signing() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [identities, setIdentities] = useState<DidSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rows, setRows] = useState<AttributeRow[]>(INITIAL_ROWS);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ json: string; verified: boolean } | null>(
    null
  );

  useEffect(() => {
    listDIDs().then((list) => {
      setIdentities(list);
      setSelectedId((prev) => prev ?? list[0]?.id ?? null);
    });
  }, []);

  const attributes = useMemo(() => {
    const obj: Record<string, string> = {};
    for (const row of rows) {
      const key = row.key.trim();
      if (key) obj[key] = row.value;
    }
    return obj;
  }, [rows]);

  function updateRow(index: number, patch: Partial<AttributeRow>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setRows((prev) => [...prev, { key: '', value: '' }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSign() {
    if (!selectedId) {
      Alert.alert('Selecione um DID emissor');
      return;
    }
    if (Object.keys(attributes).length === 0) {
      Alert.alert('Adicione ao menos um atributo com nome e valor');
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const identity = await getIdentity(selectedId);
      if (!identity) throw new Error('Identidade não encontrada na carteira');

      const issued = issueCredential(
        identity.did_document,
        identity.mldsa_private_key,
        attributes
      );

      setResult({
        json: JSON.stringify(JSON.parse(issued.signedCredential), null, 2),
        verified: issued.verified,
      });
    } catch (error) {
      Alert.alert(
        'Falha ao assinar credencial',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: c.text }]}>DID emissor</Text>
        {identities.length === 0 ? (
          <Text style={[styles.hint, { color: c.textSecondary }]}>
            Nenhum DID na carteira. Crie um DID na tela inicial primeiro.
          </Text>
        ) : (
          <View style={styles.chips}>
            {identities.map((item) => {
              const active = item.id === selectedId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSelectedId(item.id)}
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

        <Text style={[styles.sectionTitle, { color: c.text }]}>Atributos</Text>
        {rows.map((row, index) => (
          <View key={index} style={styles.row}>
            <TextInput
              value={row.key}
              onChangeText={(key) => updateRow(index, { key })}
              placeholder="atributo"
              placeholderTextColor={c.textSecondary}
              autoCapitalize="none"
              style={[
                styles.input,
                styles.inputKey,
                { backgroundColor: c.backgroundElement, color: c.text },
              ]}
            />
            <TextInput
              value={row.value}
              onChangeText={(value) => updateRow(index, { value })}
              placeholder="valor"
              placeholderTextColor={c.textSecondary}
              style={[
                styles.input,
                styles.inputValue,
                { backgroundColor: c.backgroundElement, color: c.text },
              ]}
            />
            <Pressable onPress={() => removeRow(index)} style={styles.iconBtn}>
              <Trash2 size={18} color={c.textSecondary} />
            </Pressable>
          </View>
        ))}

        <Pressable onPress={addRow} style={styles.addRow}>
          <Plus size={16} color={c.textSecondary} />
          <Text style={[styles.addRowText, { color: c.textSecondary }]}>
            Adicionar atributo
          </Text>
        </Pressable>

        <Pressable
          onPress={handleSign}
          disabled={busy}
          style={[styles.signBtn, { opacity: busy ? 0.6 : 1 }]}
        >
          {busy ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.signBtnText}>Assinar credencial</Text>
          )}
        </Pressable>

        {result && (
          <View style={styles.resultBox}>
            <View style={styles.verifiedRow}>
              {result.verified ? (
                <CheckCircle2 size={20} color="#22C55E" />
              ) : (
                <XCircle size={20} color="#EF4444" />
              )}
              <Text
                style={[
                  styles.verifiedText,
                  { color: result.verified ? '#22C55E' : '#EF4444' },
                ]}
              >
                {result.verified
                  ? 'Credencial assinada e verificada'
                  : 'Assinada, mas a verificação falhou'}
              </Text>
            </View>
            <Text
              style={[
                styles.json,
                { backgroundColor: c.backgroundElement, color: c.text },
              ]}
              selectable
            >
              {result.json}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 15,
  },
  inputKey: {
    flex: 1,
  },
  inputValue: {
    flex: 2,
  },
  iconBtn: {
    padding: Spacing.two,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  addRowText: {
    fontSize: 14,
  },
  signBtn: {
    backgroundColor: '#0D3654',
    borderRadius: 14,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  signBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  resultBox: {
    marginTop: Spacing.three,
    gap: Spacing.two,
  },
  verifiedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  verifiedText: {
    fontSize: 15,
    fontWeight: '600',
  },
  json: {
    fontFamily: 'monospace',
    fontSize: 11,
    borderRadius: 10,
    padding: Spacing.three,
  },
});

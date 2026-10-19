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
import {
  CheckCircle2,
  FileUp,
  Plus,
  Trash2,
  XCircle,
} from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';

import { BATCH_REF_TYPE } from '../crypto/keys';
import { issueWithPdf, pickPdfSaver } from '../crypto/pdf-output';
import { getIdentity, listDIDs, type DidSummary } from '../wallet/WalletDatabase';
import { Colors, Spacing } from '@/constants/theme';

type AttributeRow = { key: string; value: string };
type Mode = 'single' | 'batch';

// Parser CSV mínimo: separador `,` ou `;` (detectado pelo cabeçalho), aspas
// duplas para valores com separador e `""` como aspas escapadas.
function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const sep =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
      ? ';'
      : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

// Converte o CSV em uma lista de atributos (uma credencial por linha).
function csvToBatch(text: string): Record<string, string>[] {
  const [header, ...lines] = parseCsv(text);
  if (!header) throw new Error('CSV vazio');
  const keys = header.map((k) => k.trim());
  if (keys.some((k) => !k)) throw new Error('Há coluna sem nome no cabeçalho');
  if (new Set(keys).size !== keys.length) {
    throw new Error('Há colunas repetidas no cabeçalho');
  }
  if (lines.length === 0) throw new Error('O CSV não tem linhas de dados');

  const seen = new Set<string>();
  return lines.map((cells, i) => {
    if (cells.length !== keys.length) {
      throw new Error(
        `Linha ${i + 2}: esperado ${keys.length} valores, encontrado ${cells.length}`
      );
    }
    // O credential_id é derivado dos atributos + issued_at (comum ao lote):
    // linhas idênticas gerariam credenciais com o mesmo ID.
    const signature = JSON.stringify(cells);
    if (seen.has(signature)) throw new Error(`Linha ${i + 2} está duplicada`);
    seen.add(signature);
    return Object.fromEntries(keys.map((k, j) => [k, cells[j].trim()]));
  });
}

type BatchItem = { credentialId: string; verified: boolean; file: string };
type BatchResult = {
  batchId: string;
  issuedAt: string;
  items: BatchItem[];
  error?: string;
};

const CSV_PLACEHOLDER =
  'nome,documento\nMaria Silva,123.456.789-00\nJoão Souza,987.654.321-00';

const INITIAL_ROWS: AttributeRow[] = [
  { key: 'nome', value: '' },
  { key: 'documento', value: '' },
];

export default function Signing() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const c = Colors[scheme];

  const [identities, setIdentities] = useState<DidSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('single');
  const [rows, setRows] = useState<AttributeRow[]>(INITIAL_ROWS);
  const [csv, setCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<{
    json: string;
    verified: boolean;
  } | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);

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
    setBatchResult(null);
    try {
      const identity = await getIdentity(selectedId);
      if (!identity) throw new Error('Identidade não encontrada na carteira');

      const issued = await issueWithPdf(identity, attributes);

      setResult({
        json: JSON.stringify(JSON.parse(issued.signedCredential), null, 2),
        verified: issued.verified,
      });

      // Baixa o PDF visual da credencial para uma pasta escolhida.
      const saver = await pickPdfSaver();
      if (!saver) {
        Alert.alert('PDF não salvo', 'Nenhuma pasta foi escolhida.');
        return;
      }
      const file = await saver.save(
        `credencial-${Date.now()}`,
        issued.pdfBase64
      );
      Alert.alert('PDF salvo', file);
    } catch (error) {
      Alert.alert(
        'Falha ao assinar credencial',
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      setBusy(false);
    }
  }

  async function importCsv() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    try {
      setCsv(await new File(res.assets[0].uri).text());
    } catch (error) {
      Alert.alert(
        'Falha ao ler CSV',
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async function handleSignBatch() {
    if (!selectedId) {
      Alert.alert('Selecione um DID emissor');
      return;
    }
    let batch: Record<string, string>[];
    try {
      batch = csvToBatch(csv);
    } catch (error) {
      Alert.alert(
        'CSV inválido',
        error instanceof Error ? error.message : String(error)
      );
      return;
    }

    setBusy(true);
    setResult(null);
    setBatchResult(null);
    // Todas as credenciais do lote levam o mesmo batch_id e issued_at.
    const batchId = randomUUID();
    const issuedAt = new Date().toISOString();
    const items: BatchItem[] = [];
    try {
      const identity = await getIdentity(selectedId);
      if (!identity) throw new Error('Identidade não encontrada na carteira');

      // Escolhe a pasta antes de assinar, para não pedir N vezes.
      const saver = await pickPdfSaver();
      if (!saver) {
        Alert.alert('Lote não assinado', 'Nenhuma pasta foi escolhida.');
        return;
      }

      for (let i = 0; i < batch.length; i++) {
        setProgress(`Assinando ${i + 1}/${batch.length}…`);
        const issued = await issueWithPdf(identity, batch[i], {
          issuedAt,
          batch: {
            type: BATCH_REF_TYPE,
            batch_id: batchId,
            index: i + 1,
            total: batch.length,
          },
        });
        const seq = String(i + 1).padStart(String(batch.length).length, '0');
        const file = await saver.save(
          `credencial-lote-${batchId.slice(0, 8)}-${seq}`,
          issued.pdfBase64
        );
        items.push({
          credentialId: JSON.parse(issued.signedCredential).credential
            .credential_id,
          verified: issued.verified,
          file,
        });
      }

      setBatchResult({ batchId, issuedAt, items });
      Alert.alert(
        'Lote assinado',
        `${items.length} credenciais salvas em ${saver.location}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Mantém o que já foi emitido visível: os PDFs anteriores já foram salvos.
      setBatchResult({ batchId, issuedAt, items, error: message });
      Alert.alert(
        'Falha ao assinar lote',
        `${message}\n\n${items.length} de ${batch.length} credenciais foram emitidas antes da falha.`
      );
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: c.text }]}>
          DID emissor
        </Text>
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
                  <Text
                    style={[styles.chipText, { color: c.text }]}
                    numberOfLines={1}
                  >
                    {item.did.slice(0, 24)}…
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <View
          style={[styles.segment, { backgroundColor: c.backgroundElement }]}
        >
          {(
            [
              ['single', 'Individual'],
              ['batch', 'Em lote'],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              key={value}
              onPress={() => setMode(value)}
              disabled={busy}
              style={[
                styles.segmentItem,
                mode === value && { backgroundColor: c.backgroundSelected },
              ]}
            >
              <Text style={[styles.segmentText, { color: c.text }]}>
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        {mode === 'batch' ? (
          <>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              Credenciais (CSV)
            </Text>
            <Text style={[styles.hint, { color: c.textSecondary }]}>
              A primeira linha define os atributos; cada linha seguinte vira uma
              credencial. Todas recebem o mesmo identificador de lote, gravado
              na parte assinada da credencial.
            </Text>
            <TextInput
              value={csv}
              onChangeText={setCsv}
              placeholder={CSV_PLACEHOLDER}
              placeholderTextColor={c.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              style={[
                styles.input,
                styles.csvInput,
                { backgroundColor: c.backgroundElement, color: c.text },
              ]}
            />
            <Pressable
              onPress={importCsv}
              disabled={busy}
              style={styles.addRow}
            >
              <FileUp size={16} color={c.textSecondary} />
              <Text style={[styles.addRowText, { color: c.textSecondary }]}>
                Importar arquivo CSV
              </Text>
            </Pressable>

            <Pressable
              onPress={handleSignBatch}
              disabled={busy}
              style={[styles.signBtn, { opacity: busy ? 0.6 : 1 }]}
            >
              {busy ? (
                <View style={styles.progressRow}>
                  <ActivityIndicator color="#FFFFFF" />
                  {progress && (
                    <Text style={styles.signBtnText}>{progress}</Text>
                  )}
                </View>
              ) : (
                <Text style={styles.signBtnText}>Assinar lote</Text>
              )}
            </Pressable>

            {batchResult && (
              <View style={styles.resultBox}>
                <View style={styles.verifiedRow}>
                  {!batchResult.error &&
                  batchResult.items.every((i) => i.verified) ? (
                    <CheckCircle2 size={20} color="#22C55E" />
                  ) : (
                    <XCircle size={20} color="#EF4444" />
                  )}
                  <Text style={[styles.verifiedText, { color: c.text }]}>
                    {batchResult.items.length} credencial(is) emitida(s)
                    {batchResult.error ? ' — lote interrompido' : ''}
                  </Text>
                </View>
                <Text
                  style={[styles.meta, { color: c.textSecondary }]}
                  selectable
                >
                  Lote: {batchResult.batchId}
                </Text>
                <Text style={[styles.meta, { color: c.textSecondary }]}>
                  Emitidas em: {batchResult.issuedAt}
                </Text>
                {batchResult.error && (
                  <Text style={[styles.meta, { color: '#EF4444' }]}>
                    Erro: {batchResult.error}
                  </Text>
                )}
                {batchResult.items.map((item, i) => (
                  <View
                    key={item.credentialId}
                    style={[
                      styles.batchItem,
                      { backgroundColor: c.backgroundElement },
                    ]}
                  >
                    {item.verified ? (
                      <CheckCircle2 size={16} color="#22C55E" />
                    ) : (
                      <XCircle size={16} color="#EF4444" />
                    )}
                    <Text
                      style={[styles.batchItemText, { color: c.text }]}
                      numberOfLines={1}
                    >
                      {i + 1}. {item.credentialId}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.sectionTitle, { color: c.text }]}>
              Atributos
            </Text>
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
                <Pressable
                  onPress={() => removeRow(index)}
                  style={styles.iconBtn}
                >
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
          </>
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
  segment: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: Spacing.one,
    marginTop: Spacing.two,
  },
  segmentItem: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
  },
  csvInput: {
    minHeight: 160,
    fontFamily: 'monospace',
    fontSize: 13,
    textAlignVertical: 'top',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  meta: {
    fontSize: 12,
    fontFamily: 'monospace',
  },
  batchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  batchItemText: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 12,
  },
  json: {
    fontFamily: 'monospace',
    fontSize: 11,
    borderRadius: 10,
    padding: Spacing.three,
  },
});

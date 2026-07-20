import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ShieldCheck } from 'lucide-react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-context';

export default function LoginScreen() {
  const { signIn, signingIn } = useAuth();
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    try {
      await signIn();
      // Em caso de sucesso, o RootLayout troca para as rotas autenticadas.
    } catch (e) {
      const message =
        e instanceof Error ? e.message : 'Não foi possível entrar com o Google.';
      setError(message);
      Alert.alert('Falha no login', message);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        {/* Cabeçalho / marca */}
        <View style={styles.header}>
          <View style={styles.logoWrap}>
            <ShieldCheck size={40} color={BLUE} />
          </View>
          <ThemedText style={styles.title}>VeriFile</ThemedText>
          <ThemedText style={styles.subtitle}>
            Sua carteira de credenciais verificáveis
          </ThemedText>
        </View>

        {/* Card de login */}
        <View style={styles.card}>
          <ThemedText style={styles.cardTitle}>Acesse sua conta</ThemedText>
          <ThemedText style={styles.cardSubtitle}>
            Use sua conta Google para entrar no app.
          </ThemedText>

          <TouchableOpacity
            style={[styles.googleButton, signingIn && styles.googleButtonDisabled]}
            activeOpacity={0.85}
            onPress={handleSignIn}
            disabled={signingIn}>
            {signingIn ? (
              <ActivityIndicator color="#1A2C4E" />
            ) : (
              <>
                <View style={styles.googleIcon}>
                  <ThemedText style={styles.googleIconText}>G</ThemedText>
                </View>
                <ThemedText style={styles.googleButtonText}>
                  Continuar com Google
                </ThemedText>
              </>
            )}
          </TouchableOpacity>

          {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
        </View>

        <ThemedText style={styles.footer}>
          Pesquisa financiada pela FAPESP · UNIFESP
        </ThemedText>
      </View>
    </SafeAreaView>
  );
}

const BG = '#EDF2FA';
const CARD_BG = '#FFFFFF';
const TEXT = '#1A2C4E';
const TEXT_SECONDARY = '#6B7A90';
const BLUE = '#2B6BDF';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.five,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  logoWrap: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#E8F0FC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT,
    lineHeight: 32,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: TEXT,
  },
  cardSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    marginBottom: Spacing.two,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DADCE0',
    borderRadius: 14,
    paddingVertical: Spacing.three,
    minHeight: 52,
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  googleIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleIconText: {
    fontSize: 17,
    fontWeight: '700',
    color: BLUE,
    lineHeight: 22,
  },
  googleButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A2C4E',
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: Spacing.one,
  },
  footer: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    textAlign: 'center',
  },
});

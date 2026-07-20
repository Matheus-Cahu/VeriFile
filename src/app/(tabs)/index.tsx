import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import {
  BadgeCheck,
  ChevronRight,
  LogOut,
  Pencil,
  FileText,
  Globe,
  Inbox,
  Package,
  ShieldCheck,
  Upload,
  User,
} from 'lucide-react-native';

import { useCallback, useState } from 'react';

import { DidCard } from '@/components/did-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/auth/auth-context';
import { fetchPendingCredentials } from '@/auth/pending-credentials';

// ── Action Card ───────────────────────────────────────────────────────────────

type ActionCardProps = {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  badge?: number;
  onPress?: () => void;
};

function ActionCard({ icon, iconBg, title, subtitle, badge, onPress }: ActionCardProps) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.actionIconContainer, { backgroundColor: iconBg }]}>
        {icon}
      </View>
      <View style={styles.actionCardBody}>
        <View style={styles.actionCardTitleRow}>
          <ThemedText style={styles.actionCardTitle} numberOfLines={2}>{title}</ThemedText>
          {badge != null && (
            <View style={styles.actionBadge}>
              <ThemedText style={styles.actionBadgeText}>{badge}</ThemedText>
            </View>
          )}
        </View>
        {subtitle ? (
          <View style={styles.actionCardSubRow}>
            <ThemedText style={styles.actionCardSubtitle}>{subtitle}</ThemedText>
            <ChevronRight size={14} color="#9AA5B4" />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Export Card ───────────────────────────────────────────────────────────────

// function ExportCard() {
//   return (
//     <TouchableOpacity style={styles.exportCard}>
//       <View style={styles.exportIconContainer}>
//         <Upload size={28} color={BLUE} />
//       </View>
//       <View style={styles.exportCardText}>
//         <ThemedText style={styles.exportCardTitle}>Exportar chave pública</ThemedText>
//         <ThemedText style={styles.exportCardSubtitle}>Compartilhe sua chave pública DID</ThemedText>
//       </View>
//       <ChevronRight size={16} color="#9AA5B4" />
//     </TouchableOpacity>
//   );
// }

// ── Connection Item ───────────────────────────────────────────────────────────

type ConnectionItemProps = {
  icon: React.ReactNode;
  iconColor: string;
  name: string;
};

function ConnectionItem({ icon, iconColor, name }: ConnectionItemProps) {
  return (
    <View style={styles.connectionItem}>
      <View style={[styles.connectionIconWrap, { backgroundColor: iconColor + '18' }]}>
        {icon}
      </View>
      <ThemedText style={styles.connectionName}>{name}</ThemedText>
      <View style={styles.connectionStatus}>
        <View style={styles.connectionDot} />
        <ThemedText style={styles.connectionStatusText}>Conectado</ThemedText>
      </View>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  // Contagem de ofertas pendentes para o badge do card. Silenciosa: se o
  // backend estiver fora, o card ainda navega, só sem número.
  const [pendingCount, setPendingCount] = useState<number>(0);

  // Recarrega a contagem toda vez que a tela ganha foco (inclusive ao voltar de
  // assinar uma credencial), mantendo o número atualizado. Silencioso: se o
  // backend estiver fora, o card ainda navega, só sem número.
  useFocusEffect(
    useCallback(() => {
      if (!user?.idToken) return;
      let active = true;
      fetchPendingCredentials(user.idToken)
        .then((list) => active && setPendingCount(list.length))
        .catch(() => {});
      return () => {
        active = false;
      };
    }, [user?.idToken])
  );

  function confirmSignOut() {
    Alert.alert('Sair da conta', `Deseja sair de ${user?.email ?? 'sua conta'}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.logoWrap}>
              <ShieldCheck size={28} color={BLUE} />
            </View>
            <View>
              <ThemedText style={styles.appTitle}>Assinador</ThemedText>
              <ThemedText style={styles.appSubtitle} numberOfLines={1}>
                {user?.name ?? user?.email ?? 'Carteira e DID'}
              </ThemedText>
            </View>
          </View>
          <TouchableOpacity
            style={styles.accountWrap}
            onPress={confirmSignOut}
            accessibilityLabel="Conta e sair">
            {user?.photo ? (
              <Image source={{ uri: user.photo }} style={styles.avatar} />
            ) : (
              <User size={20} color="#1A2C4E" />
            )}
            <View style={styles.logoutBadge}>
              <LogOut size={11} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        {/* DID Card */}
        <DidCard />

        {/* Assinar nova credencial */}
        {/* <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/signing')}>
          <View style={styles.createNew}>
            <View style={styles.createNewIcon}>
              <Pencil size={20} color="#FFFFFF" />
            </View>
            <ThemedText style={styles.createNewText}>Assinar nova VC</ThemedText>
            <ChevronRight size={20} color="rgba(255,255,255,0.9)" />
          </View>
        </TouchableOpacity> */}

        {/* Verificar credencial a partir de um PDF */}
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/verify')}>
          <View style={[styles.createNew, styles.verifyVc]}>
            <View style={styles.createNewIcon}>
              <BadgeCheck size={20} color="#FFFFFF" />
            </View>
            <ThemedText style={styles.createNewText}>Verificar VC</ThemedText>
            <ChevronRight size={20} color="rgba(255,255,255,0.9)" />
          </View>
        </TouchableOpacity>
        {/* 2×2 Action Grid */}
        <View style={styles.grid}>
          <ActionCard
            icon={<FileText size={26} color={BLUE} />}
            iconBg={BLUE + '18'}
            title="Credenciais pendentes"
            subtitle={
              pendingCount > 0
                ? `${pendingCount} oferta${pendingCount > 1 ? 's' : ''} para assinar`
                : 'Nenhuma pendente'
            }
            badge={pendingCount > 0 ? pendingCount : undefined}
            onPress={() => router.push('/pendentes')}
          />
          {/* <ActionCard */}
          {/*   icon={<BadgeCheck size={26} color="#22C55E" />} */}
          {/*   iconBg="#22C55E18" */}
          {/*   title="Emitidas" */}
          {/*   subtitle="12 credenciais" */}
          {/* /> */}
          {/* <ActionCard */}
          {/*   icon={<Inbox size={26} color="#9B59B6" />} */}
          {/*   iconBg="#9B59B618" */}
          {/*   title="Recebidas" */}
          {/*   subtitle="8 credenciais" */}
          {/* /> */}
          {/* <ActionCard */}
          {/*   icon={<FileText size={26} color={BLUE} />} */}
          {/*   iconBg={BLUE + '18'} */}
          {/*   title="Verificar PDF" */}
          {/*   subtitle="Assinaturas e credenciais" */}
          {/* /> */}
        </View>

        {/* Export Card */}
        {/* <ExportCard /> */}

        {/* Conexões ativas */}
        <ThemedText style={styles.sectionTitle}>Conexões ativas</ThemedText>
        <View style={styles.connectionsRow}>
          <ConnectionItem
            icon={<Globe size={24} color={BLUE} />}
            iconColor={BLUE}
            name="Plataforma Web"
          />
          <ConnectionItem
            icon={<Package size={24} color="#22C55E" />}
            iconColor="#22C55E"
            name="IPFS"
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#E8F0FC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: TEXT,
    lineHeight: 26,
  },
  appSubtitle: {
    fontSize: 13,
    color: TEXT_SECONDARY,
    lineHeight: 18,
  },
  accountWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  logoutBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: BG,
  },

  // Action Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  actionCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    width: '100%',
  },
  actionIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  actionCardBody: {
    flex: 1,
    gap: 2,
  },
  actionCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
  },
  actionBadge: {
    backgroundColor: BLUE,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginTop: 1,
  },
  actionBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  actionCardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
    lineHeight: 18,
    flex: 1,
  },
  actionCardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actionCardSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    flex: 1,
  },

  // Export Card
  exportCard: {
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  exportIconContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: BLUE + '18',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  exportCardText: {
    flex: 1,
  },
  exportCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
  },
  exportCardSubtitle: {
    fontSize: 12,
    color: TEXT_SECONDARY,
    marginTop: 2,
  },

  // Connections
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT,
    marginBottom: -Spacing.one,
  },
  connectionsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  connectionItem: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 16,
    padding: Spacing.three,
    gap: 6,
  },
  connectionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  connectionName: {
    fontSize: 13,
    fontWeight: '700',
    color: TEXT,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22C55E',
  },
  connectionStatusText: {
    fontSize: 12,
    color: TEXT_SECONDARY,
  },
  createNew: {
    backgroundColor: '#22C55E',
    borderRadius: 16,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    shadowColor: '#22C55E',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  verifyVc: {
    backgroundColor: '#0D3654',
    shadowColor: '#0D3654',
    marginTop: Spacing.two,
  },
  createNewIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createNewText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});

import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

// ── DID Card ──────────────────────────────────────────────────────────────────

function DidCard() {
  return (
    <View style={styles.didCard}>
      <View style={styles.didBadge}>
        <ThemedText style={styles.didBadgeText}>DID</ThemedText>
      </View>

      <View style={styles.didCardTop}>
        <View style={styles.didStatusRow}>
          <ThemedText style={styles.didActiveTitle}>DID ativo</ThemedText>
          <SymbolView
            name="checkmark.circle.fill"
            size={22}
            tintColor="#22C55E"
            style={styles.didCheckIcon}
          />
        </View>
        <View style={styles.didAddressRow}>
          <ThemedText style={styles.didAddress}>did:tdw:0x7f3a...9b2c</ThemedText>
          <SymbolView name="doc.on.doc" size={16} tintColor="#A0C4E8" />
        </View>

        <SymbolView
          name="lock.shield.fill"
          size={72}
          tintColor="rgba(255,255,255,0.18)"
          style={styles.didShieldIcon}
        />
      </View>

      <View style={styles.didCardDivider} />

      <View style={styles.didCardBottom}>
        <SymbolView name="cylinder.split.1x2.fill" size={28} tintColor="#A0C4E8" />
        <View style={styles.didWalletInfo}>
          <ThemedText style={styles.didWalletLabel}>Carteira</ThemedText>
          <ThemedText style={styles.didWalletValue}>SQLite cifrado</ThemedText>
        </View>
        <View style={styles.didProtectedBadge}>
          <ThemedText style={styles.didProtectedText}>Protegida</ThemedText>
        </View>
      </View>
    </View>
  );
}

// ── Action Card ───────────────────────────────────────────────────────────────

type ActionCardProps = {
  icon: string;
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: number;
};

function ActionCard({ icon, iconColor, title, subtitle, badge }: ActionCardProps) {
  return (
    <TouchableOpacity style={styles.actionCard}>
      <View style={[styles.actionIconContainer, { backgroundColor: iconColor + '18' }]}>
        <SymbolView name={icon as any} size={26} tintColor={iconColor} />
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
            <SymbolView name="chevron.right" size={11} tintColor="#9AA5B4" />
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

// ── Export Card ───────────────────────────────────────────────────────────────

function ExportCard() {
  return (
    <TouchableOpacity style={styles.exportCard}>
      <View style={styles.exportIconContainer}>
        <SymbolView name="square.and.arrow.up.on.square" size={28} tintColor={BLUE} />
      </View>
      <View style={styles.exportCardText}>
        <ThemedText style={styles.exportCardTitle}>Exportar chave pública</ThemedText>
        <ThemedText style={styles.exportCardSubtitle}>Compartilhe sua chave pública DID</ThemedText>
      </View>
      <SymbolView name="chevron.right" size={14} tintColor="#9AA5B4" />
    </TouchableOpacity>
  );
}

// ── Connection Item ───────────────────────────────────────────────────────────

type ConnectionItemProps = {
  icon: string;
  iconColor: string;
  name: string;
};

function ConnectionItem({ icon, iconColor, name }: ConnectionItemProps) {
  return (
    <View style={styles.connectionItem}>
      <View style={[styles.connectionIconWrap, { backgroundColor: iconColor + '18' }]}>
        <SymbolView name={icon as any} size={24} tintColor={iconColor} />
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
              <SymbolView name="lock.shield.fill" size={32} tintColor="#2B6BDF" />
            </View>
            <View>
              <ThemedText style={styles.appTitle}>Assinador</ThemedText>
              <ThemedText style={styles.appSubtitle}>Carteira e DID</ThemedText>
            </View>
          </View>
          <TouchableOpacity style={styles.bellWrap}>
            <SymbolView name="bell.fill" size={20} tintColor="#1A2C4E" />
            <View style={styles.bellDot} />
          </TouchableOpacity>
        </View>

        {/* DID Card */}
        <DidCard />

        {/* 2×2 Action Grid */}
        <View style={styles.grid}>
          <ActionCard
            icon="doc.badge.clock"
            iconColor="#2B6BDF"
            title="Credenciais pendentes"
            subtitle=""
            badge={3}
          />
          <ActionCard
            icon="checkmark.seal.fill"
            iconColor="#22C55E"
            title="Emitidas"
            subtitle="12 credenciais"
          />
          <ActionCard
            icon="tray.and.arrow.down.fill"
            iconColor="#9B59B6"
            title="Recebidas"
            subtitle="8 credenciais"
          />
          <ActionCard
            icon="doc.richtext.fill"
            iconColor="#2B6BDF"
            title="Verificar PDF"
            subtitle="Assinaturas e credenciais"
          />
        </View>

        {/* Export Card */}
        <ExportCard />

        {/* Conexões ativas */}
        <ThemedText style={styles.sectionTitle}>Conexões ativas</ThemedText>
        <View style={styles.connectionsRow}>
          <ConnectionItem icon="globe" iconColor="#2B6BDF" name="Plataforma Web" />
          <ConnectionItem icon="shippingbox.fill" iconColor="#22C55E" name="IPFS" />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BG = '#EDF2FA';
const CARD_BG = '#FFFFFF';
const DID_CARD_BG = '#0D3654';
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
  bellWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BLUE,
    borderWidth: 1.5,
    borderColor: CARD_BG,
  },

  // DID Card
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
  didCheckIcon: {
    marginTop: 2,
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
    minWidth: '47%',
    maxWidth: '48%',
    flex: 1,
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
});

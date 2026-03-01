// PDF Export using @react-pdf/renderer
// Dynamic import in AthleteProfilePage to avoid bundle bloat

import { formatMmSs, formatDateRo } from './utils';

interface ExportParams {
  athlete: any;
  analysis: any;
}

export default async function exportAthletePdf({ athlete, analysis }: ExportParams) {
  const { pdf, Document, Page, Text, View, StyleSheet, Image } = await import('@react-pdf/renderer');

  const stats = analysis?.statistics;
  const badges: any[] = analysis?.badges ?? [];
  const recentResults: any[] = analysis?.recent_results ?? [];

  const styles = StyleSheet.create({
    page: { padding: 32, fontFamily: 'Helvetica', backgroundColor: '#FAFAFA' },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 24, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
    title: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#111827' },
    subtitle: { fontSize: 11, color: '#6B7280', marginTop: 4 },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 },
    statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    statCard: { width: '47%', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 10 },
    statLabel: { fontSize: 9, color: '#9CA3AF', marginBottom: 3 },
    statValue: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111827' },
    badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
    badge: { backgroundColor: '#EEF2FF', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
    badgeText: { fontSize: 9, color: '#4338CA', fontFamily: 'Helvetica-Bold' },
    resultRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
    resultTime: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#111827' },
    resultMeta: { fontSize: 9, color: '#6B7280' },
    footer: { position: 'absolute', bottom: 24, left: 32, right: 32, flexDirection: 'row', justifyContent: 'space-between' },
    footerText: { fontSize: 8, color: '#9CA3AF' },
  });

  const MyDocument = () => (
    <Document title={`Raport ${athlete?.full_name}`}>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{athlete?.full_name ?? '—'}</Text>
            <Text style={styles.subtitle}>
              {athlete?.structure ?? ''} · {athlete?.default_race ?? 'NONE'} · Generat {formatDateRo(new Date().toISOString().split('T')[0])}
            </Text>
          </View>
        </View>

        {/* Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistici</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>🏆 Best timp</Text>
              <Text style={styles.statValue}>{stats?.best_ms ? formatMmSs(stats.best_ms) : '—'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>📈 Îmbunătățire</Text>
              <Text style={styles.statValue}>{stats?.improvement_percent ? `${Number(stats.improvement_percent).toFixed(1)}%` : '—'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>🔥 Streak</Text>
              <Text style={styles.statValue}>{stats?.streak_days ?? 0} zile</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>🎯 PCS mediu</Text>
              <Text style={styles.statValue}>{stats?.avg_pcs_last5 ? Number(stats.avg_pcs_last5).toFixed(0) : '—'}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Curse totale</Text>
              <Text style={styles.statValue}>{stats?.total_runs ?? 0}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Prezențe 30 zile</Text>
              <Text style={styles.statValue}>{stats?.attendance_30d ?? 0}</Text>
            </View>
          </View>
        </View>

        {/* Runner type */}
        {stats?.runner_type && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tip alergător</Text>
            <View style={{ backgroundColor: '#EEF2FF', borderRadius: 8, padding: 10 }}>
              <Text style={{ fontSize: 13, fontFamily: 'Helvetica-Bold', color: '#4338CA' }}>
                {stats.runner_type === 'SPRINTER' ? '🦅 Sprinter' :
                 stats.runner_type === 'DIESEL' ? '⚙️ Diesel' :
                 stats.runner_type === 'SUICIDE_STARTER' ? '💥 Suicide Starter' : '🌊 Fade Runner'}
              </Text>
            </View>
          </View>
        )}

        {/* Recent results */}
        {recentResults.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ultimele curse</Text>
            {recentResults.slice(0, 8).map((r: any, i: number) => (
              <View key={i} style={styles.resultRow}>
                <Text style={styles.resultTime}>{formatMmSs(r.result_ms)}</Text>
                <Text style={styles.resultMeta}>
                  {formatDateRo(r.recorded_at?.split('T')[0])} · PCS {r.pcs ?? '—'}{r.is_simulation ? ' · Simulare' : ''}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Badges */}
        {badges.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Badge-uri câștigate ({badges.length})</Text>
            <View style={styles.badgesRow}>
              {badges.map((b: any, i: number) => (
                <View key={i} style={styles.badge}>
                  <Text style={styles.badgeText}>{b.icon} {b.name}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>AthletiCoach · {athlete?.full_name}</Text>
          <Text style={styles.footerText} render={({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );

  const blob = await pdf(<MyDocument />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `raport-${(athlete?.full_name ?? 'sportiv').replace(/\s+/g, '-').toLowerCase()}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

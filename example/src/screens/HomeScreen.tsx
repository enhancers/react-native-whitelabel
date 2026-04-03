import React from 'react';
import { StyleSheet, View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRNWLFeatures } from 'react-native-whitelabel';

export default function HomeScreen() {
  const { allFeatures, isFeatureEnabled, isLoading, params, displayName, packageName } = useRNWLFeatures();

  // isLoading is false on first render for native (sync initialization).
  // It may be true on web or when using a custom featureLoader.
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.loadingText}>Loading features...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <Text style={styles.title}>{displayName}</Text>
          <Text style={styles.packageName}>{packageName}</Text>
          {isFeatureEnabled('darkMode') && (
            <Text style={styles.badge}>Dark Mode</Text>
          )}
        </View>

        {Object.keys(params).length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Brand Params</Text>
            {Object.entries(params).map(([key, value]) => (
              <View key={key} style={styles.paramRow}>
                <Text style={styles.paramKey}>{key}</Text>
                <Text style={styles.paramValue}>
                  {Array.isArray(value) ? value.join(', ') : String(value)}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Features</Text>
          <View style={styles.featureGrid}>
            {Object.entries(allFeatures).map(([featureName, isEnabled]) => (
              <View
                key={featureName}
                style={[
                  styles.featureCard,
                  isEnabled ? styles.featureEnabled : styles.featureDisabled,
                ]}
              >
                <Text style={styles.featureName}>{featureName}</Text>
                <Text style={styles.featureStatus}>
                  {isEnabled ? '✅ ON' : '❌ OFF'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  header: {
    paddingVertical: 24,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000',
    marginBottom: 4,
  },
  packageName: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  loadingText: {
    fontSize: 16,
    color: '#999',
  },
  section: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  featureGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  featureCard: {
    flex: 1,
    minWidth: '45%',
    borderRadius: 8,
    padding: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
  },
  featureEnabled: {
    borderColor: '#4CAF50',
    backgroundColor: '#f1f8f4',
  },
  featureDisabled: {
    borderColor: '#e0e0e0',
    backgroundColor: '#fafafa',
  },
  featureName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    textTransform: 'capitalize',
  },
  featureStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  badge: {
    fontSize: 11,
    color: '#fff',
    backgroundColor: '#333',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    overflow: 'hidden',
  },
  paramRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  paramKey: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    fontFamily: 'monospace',
  },
  paramValue: {
    fontSize: 13,
    color: '#666',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: 12,
  },
});

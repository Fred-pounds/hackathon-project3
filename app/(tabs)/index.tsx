import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Eye, EyeOff, ArrowUpRight, ArrowDownLeft, Send, Activity, Plus, AlertCircle, Shield, TrendingUp, Bell, CreditCard } from 'lucide-react-native';
import { router } from 'expo-router';

interface Transaction {
  id: string;
  amount: number;
  createdAt: Date;
  senderName: string;
  recipientName: string;
  type: 'sent' | 'received';
}

export default function Wallet() {
  const { profile, user, canPerformTransactions, canSendMoney, canReceiveMoney, canDeposit, refreshProfile } = useAuth();
  const [showBalance, setShowBalance] = useState(true);
  const [recentTransactions, setRecentTransactions] = useState<Transaction[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [pendingTransfersCount, setPendingTransfersCount] = useState(0);



  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchRecentTransactions();
      await refreshProfile();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const fetchRecentTransactions = async () => {
    if (!user) return;

    try {
      const transactionsQuery = query(
        collection(db, 'transactions'),
        where('senderId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(5)
      );

      const receivedQuery = query(
        collection(db, 'transactions'),
        where('recipientId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(5)
      );

      const [sentSnapshot, receivedSnapshot] = await Promise.all([
        getDocs(transactionsQuery),
        getDocs(receivedQuery)
      ]);

      const allTransactions: Transaction[] = [];

      // Process sent transactions
      for (const docSnapshot of sentSnapshot.docs) {
        const data = docSnapshot.data();
        const recipientDoc = await getDoc(doc(db, 'profiles', data.recipientId));
        const recipientData = recipientDoc.data();
        
        allTransactions.push({
          id: docSnapshot.id,
          amount: data.amount,
          createdAt: data.createdAt.toDate(),
          senderName: profile?.fullName || '',
          recipientName: recipientData?.fullName || 'Unknown',
          type: 'sent',
        });
      }

      // Process received transactions
      for (const docSnapshot of receivedSnapshot.docs) {
        const data = docSnapshot.data();
        const senderDoc = await getDoc(doc(db, 'profiles', data.senderId));
        const senderData = senderDoc.data();
        
        allTransactions.push({
          id: docSnapshot.id,
          amount: data.amount,
          createdAt: data.createdAt.toDate(),
          senderName: senderData?.fullName || 'Unknown',
          recipientName: profile?.fullName || '',
          type: 'received',
        });
      }

      // Sort by date and take top 5
      allTransactions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      setRecentTransactions(allTransactions.slice(0, 5));

    } catch (error) {
      console.error('Error fetching transactions:', error);
    }
  };

  const fetchPendingTransfersCount = async () => {
    if (!user) return;

    try {
      const pendingQuery = query(
        collection(db, 'transferRequests'),
        where('senderId', '==', user.uid),
        where('status', 'in', ['pending', 'verified'])
      );

      const snapshot = await getDocs(pendingQuery);
      setPendingTransfersCount(snapshot.size);
    } catch (error) {
      console.error('Error fetching pending transfers count:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([
      fetchRecentTransactions(),
      fetchPendingTransfersCount(),
      refreshProfile()
    ]);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchRecentTransactions();
    fetchPendingTransfersCount();
  }, [user]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency: 'GHS',
    }).format(amount);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GH', {
      month: 'short',
      day: 'numeric',
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.greeting}>{getGreeting()},</Text>
            <Text style={styles.name}>{profile?.fullName}</Text>
            <Text style={styles.welcomeText}>Welcome to PayFlow Ghana</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity 
              style={styles.notificationButton}
              onPress={() => router.push('/(tabs)/notifications')}
            >
              <Bell size={24} color="#374151" />
              {/* Add notification badge here if needed */}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceHeader}>
            <View style={styles.balanceInfo}>
              <Text style={styles.balanceLabel}>Wallet Balance</Text>
              <Text style={styles.currencyLabel}>Ghana Cedi (GHS)</Text>
            </View>
            <TouchableOpacity 
              style={styles.eyeButton}
              onPress={() => setShowBalance(!showBalance)}
            >
              {showBalance ? (
                <Eye size={20} color="#6B7280" />
              ) : (
                <EyeOff size={20} color="#6B7280" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.balance}>
            {showBalance ? formatCurrency(profile?.walletBalance || 0) : '••••••'}
          </Text>
          <View style={styles.balanceFooter}>
            <View style={styles.balanceStat}>
              <TrendingUp size={16} color="#22C55E" />
              <Text style={styles.balanceStatText}>Active Account</Text>
            </View>
          </View>
        </View>

        <View style={styles.quickActions}>
          <TouchableOpacity 
            style={[styles.actionCard, !canSendMoney() && styles.actionCardDisabled]}
            onPress={() => canSendMoney() ? router.push('/(tabs)/send') : null}
            disabled={!canSendMoney()}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#EFF6FF' }]}>
              <Send size={24} color={canSendMoney() ? "#3B82F6" : "#9CA3AF"} />
            </View>
            <Text style={[styles.actionTitle, !canSendMoney() && styles.actionTitleDisabled]}>
              {canSendMoney() ? 'Send Money' : 'Send Money'}
            </Text>
            <Text style={[styles.actionSubtitle, !canSendMoney() && styles.actionSubtitleDisabled]}>
              {canSendMoney() ? 'Transfer to friends' : 'Verification required'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionCard, !canPerformTransactions() && styles.actionCardDisabled]}
            onPress={() => canPerformTransactions() ? router.push('/(tabs)/transactions') : null}
            disabled={!canPerformTransactions()}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#F0FDF4' }]}>
              <Activity size={24} color={canPerformTransactions() ? "#22C55E" : "#9CA3AF"} />
              {pendingTransfersCount > 0 && canPerformTransactions() && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingTransfersCount}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.actionTitle, !canPerformTransactions() && styles.actionTitleDisabled]}>
              {canPerformTransactions() ? 'Activity' : 'Activity'}
            </Text>
            <Text style={[styles.actionSubtitle, !canPerformTransactions() && styles.actionSubtitleDisabled]}>
              {canPerformTransactions() ? 'View history' : 'Verification required'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionCard, !canDeposit() && styles.actionCardDisabled]}
            onPress={() => canDeposit() ? router.push('/(tabs)/deposit') : null}
            disabled={!canDeposit()}
          >
            <View style={[styles.actionIcon, { backgroundColor: '#FEF3C7' }]}>
              <Plus size={24} color={canDeposit() ? "#F59E0B" : "#9CA3AF"} />
            </View>
            <Text style={[styles.actionTitle, !canDeposit() && styles.actionTitleDisabled]}>
              {canDeposit() ? 'Deposit' : 'Deposit'}
            </Text>
            <Text style={[styles.actionSubtitle, !canDeposit() && styles.actionSubtitleDisabled]}>
              {canDeposit() ? 'Add money' : 'Verification required'}
            </Text>
          </TouchableOpacity>
        </View>

        {profile?.verificationStatus === 'pending' && (
          <View style={styles.verificationBanner}>
            <View style={styles.verificationBannerContent}>
              <Shield size={20} color="#F59E0B" />
              <View style={styles.verificationBannerText}>
                <Text style={styles.verificationBannerTitle}>Complete Verification</Text>
                <Text style={styles.verificationBannerSubtitle}>
                  Verify your identity to unlock all features
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.verificationBannerButton}
                onPress={() => router.push('/(tabs)/document-upload')}
              >
                <Text style={styles.verificationBannerButtonText}>Verify Now</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Debug Section - Remove this in production */}
        {(typeof __DEV__ !== 'undefined' && __DEV__) && (
          <View style={styles.debugSection}>
            <Text style={styles.debugTitle}>Debug Info (Dev Only)</Text>
            <Text style={styles.debugText}>User ID: {user?.uid || 'None'}</Text>
            <Text style={styles.debugText}>Profile: {profile ? 'Loaded' : 'Not loaded'}</Text>
            <Text style={styles.debugText}>Email Verified: {user?.emailVerified ? 'Yes' : 'No'}</Text>
            <Text style={styles.debugText}>Profile ID: {profile?.id || 'None'}</Text>
            <Text style={styles.debugText}>Full Name: {profile?.fullName || 'None'}</Text>
            <Text style={styles.debugText}>Wallet Balance: {profile?.walletBalance || 'None'}</Text>
            <TouchableOpacity 
              style={styles.debugRefreshButton}
              onPress={refreshProfile}
            >
              <Text style={styles.debugRefreshButtonText}>Manual Refresh Profile</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.paymentMethodsBanner}>
          <View style={styles.paymentMethodsBannerContent}>
            <CreditCard size={20} color="#8B5CF6" />
            <View style={styles.paymentMethodsBannerText}>
              <Text style={styles.paymentMethodsBannerTitle}>Link Payment Methods</Text>
              <Text style={styles.paymentMethodsBannerSubtitle}>
                Add bank accounts and mobile money for easy transactions
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.paymentMethodsBannerButton}
              onPress={() => router.push('/(tabs)/payment-methods')}
            >
              <Text style={styles.paymentMethodsBannerButtonText}>Add Now</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Activity</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
              <Text style={styles.viewAllText}>View All</Text>
            </TouchableOpacity>
          </View>
          
          {recentTransactions.length === 0 ? (
            <View style={styles.emptyState}>
              <Activity size={48} color="#D1D5DB" />
              <Text style={styles.emptyText}>No transactions yet</Text>
              <Text style={styles.emptySubtext}>Start sending money to see your activity here</Text>
            </View>
          ) : (
            <View style={styles.transactionsList}>
              {recentTransactions.map((transaction, index) => (
                <View key={transaction.id} style={[
                  styles.transactionItem,
                  index === recentTransactions.length - 1 && styles.transactionItemLast
                ]}>
                  <View style={[
                    styles.transactionIcon,
                    { backgroundColor: transaction.type === 'sent' ? '#FEF2F2' : '#F0FDF4' }
                  ]}>
                    {transaction.type === 'sent' ? (
                      <ArrowUpRight size={16} color="#EF4444" />
                    ) : (
                      <ArrowDownLeft size={16} color="#22C55E" />
                    )}
                  </View>
                  <View style={styles.transactionDetails}>
                    <Text style={styles.transactionName}>
                      {transaction.type === 'sent' 
                        ? `To ${transaction.recipientName}`
                        : `From ${transaction.senderName}`
                      }
                    </Text>
                    <Text style={styles.transactionDate}>
                      {formatDate(transaction.createdAt)}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.transactionAmount,
                      { color: transaction.type === 'sent' ? '#EF4444' : '#22C55E' }
                    ]}
                  >
                    {transaction.type === 'sent' ? '-' : '+'}
                    {formatCurrency(transaction.amount)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 24,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  greeting: {
    fontSize: 16,
    color: '#6B7280',
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 4,
  },
  welcomeText: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  notificationButton: {
    padding: 8,
  },
  balanceCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginBottom: 32,
    padding: 24,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceInfo: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  currencyLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  eyeButton: {
    padding: 8,
  },
  balance: {
    fontSize: 36,
    fontWeight: '800',
    color: '#1F2937',
  },
  balanceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  balanceStat: {
    alignItems: 'center',
  },
  balanceStatText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 24,
    marginBottom: 32,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  actionCard: {
    alignItems: 'center',
    width: '33%', // Three cards in a row
  },
  actionCardDisabled: {
    opacity: 0.7,
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  actionTitleDisabled: {
    color: '#9CA3AF',
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
  actionSubtitleDisabled: {
    color: '#9CA3AF',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#EF4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  verificationBanner: {
    backgroundColor: '#FEF3C7',
    padding: 16,
    borderRadius: 12,
    marginHorizontal: 24,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  verificationBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  verificationBannerText: {
    marginLeft: 12,
    flex: 1,
  },
  verificationBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  verificationBannerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  verificationBannerButton: {
    backgroundColor: '#F59E0B',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 12,
  },
  verificationBannerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  paymentMethodsBanner: {
    backgroundColor: '#F8FAFC',
    marginHorizontal: 24,
    marginBottom: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paymentMethodsBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  paymentMethodsBannerText: {
    flex: 1,
    marginLeft: 16,
  },
  paymentMethodsBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  paymentMethodsBannerSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  paymentMethodsBannerButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginLeft: 12,
  },
  paymentMethodsBannerButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  section: {
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  viewAllText: {
    fontSize: 14,
    color: '#3B82F6',
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  transactionsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  transactionItemLast: {
    borderBottomWidth: 0,
  },
  transactionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  transactionDetails: {
    flex: 1,
  },
  transactionName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  transactionDate: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '600',
  },
  debugSection: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  debugTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  debugText: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  debugRefreshButton: {
    backgroundColor: '#E0E7FF',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  debugRefreshButtonText: {
    color: '#3B82F6',
    fontSize: 14,
    fontWeight: '600',
  },
});
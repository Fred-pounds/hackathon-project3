import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, TextInput, Alert, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { router } from 'expo-router';
import { 
  ArrowLeft, 
  Plus, 
  CreditCard, 
  Bank, 
  Shield,
  Trash2,
  Edit3,
  CheckCircle,
  X
} from 'lucide-react-native';
import { db } from '@/lib/firebase';
import { doc, setDoc, getDoc, updateDoc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';

interface PaymentMethod {
  id: string;
  type: 'bank' | 'mobile_money' | 'card';
  name: string;
  accountNumber?: string;
  bankName?: string;
  phoneNumber?: string;
  provider?: string;
  cardNumber?: string;
  expiryDate?: string;
  isDefault: boolean;
  isVerified: boolean;
  createdAt: Date;
}

export default function PaymentMethods() {
  const { user, profile } = useAuth();
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(false);

  // Form states
  const [methodType, setMethodType] = useState<'bank' | 'mobile_money' | 'card'>('bank');
  const [methodName, setMethodName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [bankName, setBankName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [provider, setProvider] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    if (user) {
      loadPaymentMethods();
    }
  }, [user]);

  const loadPaymentMethods = () => {
    if (!user) return;

    const unsubscribe = onSnapshot(
      collection(db, 'profile', user.uid, 'paymentMethods'),
      (snapshot) => {
        const methods: PaymentMethod[] = [];
        snapshot.forEach((doc) => {
          methods.push({ id: doc.id, ...doc.data() } as PaymentMethod);
        });
        setPaymentMethods(methods.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()));
      },
      (error) => {
        console.error('Error loading payment methods:', error);
        Alert.alert('Error', 'Failed to load payment methods');
      }
    );

    return unsubscribe;
  };

  const resetForm = () => {
    setMethodType('bank');
    setMethodName('');
    setAccountNumber('');
    setBankName('');
    setPhoneNumber('');
    setProvider('');
    setCardNumber('');
    setExpiryDate('');
  };

  const handleAddMethod = async () => {
    if (!user) return;

    if (!methodName.trim()) {
      Alert.alert('Error', 'Please enter a name for this payment method');
      return;
    }

    setLoading(true);
    try {
      const newMethod: Omit<PaymentMethod, 'id'> = {
        type: methodType,
        name: methodName.trim(),
        isDefault: paymentMethods.length === 0,
        isVerified: false,
        createdAt: new Date(),
        ...(methodType === 'bank' && {
          accountNumber: accountNumber.trim(),
          bankName: bankName.trim(),
        }),
        ...(methodType === 'mobile_money' && {
          phoneNumber: phoneNumber.trim(),
          provider: provider.trim(),
        }),
        ...(methodType === 'card' && {
          cardNumber: cardNumber.trim(),
          expiryDate: expiryDate.trim(),
        }),
      };

      const methodRef = doc(collection(db, 'profile', user.uid, 'paymentMethods'));
      await setDoc(methodRef, newMethod);

      Alert.alert('Success', 'Payment method added successfully!');
      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Error adding payment method:', error);
      Alert.alert('Error', 'Failed to add payment method');
    } finally {
      setLoading(false);
    }
  };

  const handleEditMethod = async () => {
    if (!editingMethod || !user) return;

    if (!methodName.trim()) {
      Alert.alert('Error', 'Please enter a name for this payment method');
      return;
    }

    setLoading(true);
    try {
      const updatedMethod = {
        name: methodName.trim(),
        ...(editingMethod.type === 'bank' && {
          accountNumber: accountNumber.trim(),
          bankName: bankName.trim(),
        }),
        ...(editingMethod.type === 'mobile_money' && {
          phoneNumber: phoneNumber.trim(),
          provider: provider.trim(),
        }),
        ...(editingMethod.type === 'card' && {
          cardNumber: cardNumber.trim(),
          expiryDate: expiryDate.trim(),
        }),
      };

      await updateDoc(doc(db, 'profile', user.uid, 'paymentMethods', editingMethod.id), updatedMethod);

      Alert.alert('Success', 'Payment method updated successfully!');
      setShowEditModal(false);
      setEditingMethod(null);
      resetForm();
    } catch (error) {
      console.error('Error updating payment method:', error);
      Alert.alert('Error', 'Failed to update payment method');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteMethod = async (methodId: string) => {
    if (!user) return;

    Alert.alert(
      'Delete Payment Method',
      'Are you sure you want to delete this payment method? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'users', user.uid, 'paymentMethods', methodId));
              Alert.alert('Success', 'Payment method deleted successfully!');
            } catch (error) {
              console.error('Error deleting payment method:', error);
              Alert.alert('Error', 'Failed to delete payment method');
            }
          },
        },
      ]
    );
  };

  const handleSetDefault = async (methodId: string) => {
    if (!user) return;

    try {
      // Remove default from all methods
      const batch = paymentMethods.map(method =>
        updateDoc(doc(db, 'users', user.uid, 'paymentMethods', method.id), { isDefault: false })
      );

      // Set new default
      await Promise.all(batch);
      await updateDoc(doc(db, 'users', user.uid, 'paymentMethods', methodId), { isDefault: true });

      Alert.alert('Success', 'Default payment method updated!');
    } catch (error) {
      console.error('Error setting default method:', error);
      Alert.alert('Error', 'Failed to update default method');
    }
  };

  const openEditModal = (method: PaymentMethod) => {
    setEditingMethod(method);
    setMethodName(method.name);
    setMethodType(method.type);
    setAccountNumber(method.accountNumber || '');
    setBankName(method.bankName || '');
    setPhoneNumber(method.phoneNumber || '');
    setProvider(method.provider || '');
    setCardNumber(method.cardNumber || '');
    setExpiryDate(method.expiryDate || '');
    setShowEditModal(true);
  };

  const renderPaymentMethod = ({ item }: { item: PaymentMethod }) => (
    <View style={styles.methodCard}>
      <View style={styles.methodHeader}>
        <View style={styles.methodIcon}>
          {item.type === 'bank' && <Bank size={24} color="#3B82F6" />}
          {item.type === 'mobile_money' && <CreditCard size={24} color="#8B5CF6" />}
          {item.type === 'card' && <CreditCard size={24} color="#22C55E" />}
        </View>
        <View style={styles.methodInfo}>
          <Text style={styles.methodName}>{item.name}</Text>
          <Text style={styles.methodDetails}>
            {item.type === 'bank' && `${item.bankName} • ${item.accountNumber}`}
            {item.type === 'mobile_money' && `${item.provider} • ${item.phoneNumber}`}
            {item.type === 'card' && `•••• ${item.cardNumber.slice(-4)} • ${item.expiryDate}`}
          </Text>
        </View>
        <View style={styles.methodStatus}>
          {item.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Default</Text>
            </View>
          )}
          {item.isVerified ? (
            <CheckCircle size={20} color="#22C55E" />
          ) : (
            <Text style={styles.pendingText}>Pending</Text>
          )}
        </View>
      </View>
      
      <View style={styles.methodActions}>
        <TouchableOpacity
          style={[styles.actionButton, styles.editButton]}
          onPress={() => openEditModal(item)}
        >
          <Edit3 size={16} color="#3B82F6" />
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        
        {!item.isDefault && (
          <TouchableOpacity
            style={[styles.actionButton, styles.defaultButton]}
            onPress={() => handleSetDefault(item.id)}
          >
            <Text style={styles.defaultButtonText}>Set Default</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteMethod(item.id)}
        >
          <Trash2 size={16} color="#EF4444" />
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderAddModal = () => (
    <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Add Payment Method</Text>
          <TouchableOpacity onPress={() => setShowAddModal(false)}>
            <X size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {/* Method Type Selection */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Method Type</Text>
            <View style={styles.typeSelector}>
              {(['bank', 'mobile_money', 'card'] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[styles.typeOption, methodType === type && styles.typeOptionActive]}
                  onPress={() => setMethodType(type)}
                >
                  <Text style={[styles.typeOptionText, methodType === type && styles.typeOptionTextActive]}>
                    {type === 'bank' ? 'Bank Account' : type === 'mobile_money' ? 'Mobile Money' : 'Card'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Common Fields */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={methodName}
              onChangeText={setMethodName}
              placeholder="e.g., My Main Bank Account"
            />
          </View>

          {/* Type-specific Fields */}
          {methodType === 'bank' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bank Name</Text>
                <TextInput
                  style={styles.input}
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="e.g., Ghana Commercial Bank"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="e.g., 1234567890"
                  keyboardType="numeric"
                />
              </View>
            </>
          )}

          {methodType === 'mobile_money' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Provider</Text>
                <TextInput
                  style={styles.input}
                  value={provider}
                  onChangeText={setProvider}
                  placeholder="e.g., MTN, Vodafone, AirtelTigo"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="e.g., 0241234567"
                  keyboardType="phone-pad"
                />
              </View>
            </>
          )}

          {methodType === 'card' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Card Number</Text>
                <TextInput
                  style={styles.input}
                  value={cardNumber}
                  onChangeText={setCardNumber}
                  placeholder="e.g., 1234 5678 9012 3456"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Expiry Date</Text>
                <TextInput
                  style={styles.input}
                  value={expiryDate}
                  onChangeText={setExpiryDate}
                  placeholder="e.g., 12/25"
                />
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowAddModal(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, loading && styles.addButtonDisabled]}
            onPress={handleAddMethod}
            disabled={loading}
          >
            <Text style={styles.addButtonText}>
              {loading ? 'Adding...' : 'Add Method'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );

  const renderEditModal = () => (
    <Modal visible={showEditModal} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={styles.modalContainer}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>Edit Payment Method</Text>
          <TouchableOpacity onPress={() => setShowEditModal(false)}>
            <X size={24} color="#6B7280" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.modalContent}>
          {/* Same form fields as add modal */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Name</Text>
            <TextInput
              style={styles.input}
              value={methodName}
              onChangeText={setMethodName}
              placeholder="e.g., My Main Bank Account"
            />
          </View>

          {editingMethod?.type === 'bank' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Bank Name</Text>
                <TextInput
                  style={styles.input}
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="e.g., Ghana Commercial Bank"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="e.g., 1234567890"
                  keyboardType="numeric"
                />
              </View>
            </>
          )}

          {editingMethod?.type === 'mobile_money' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Provider</Text>
                <TextInput
                  style={styles.input}
                  value={provider}
                  onChangeText={setProvider}
                  placeholder="e.g., MTN, Vodafone, AirtelTigo"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number</Text>
                <TextInput
                  style={styles.input}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                  placeholder="e.g., 0241234567"
                  keyboardType="phone-pad"
                />
              </View>
            </>
          )}

          {editingMethod?.type === 'card' && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Card Number</Text>
                <TextInput
                  style={styles.input}
                  value={cardNumber}
                  onChangeText={setCardNumber}
                  placeholder="e.g., 1234 5678 9012 3456"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Expiry Date</Text>
                <TextInput
                  style={styles.input}
                  value={expiryDate}
                  onChangeText={setExpiryDate}
                  placeholder="e.g., 12/25"
                />
              </View>
            </>
          )}
        </ScrollView>

        <View style={styles.modalFooter}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowEditModal(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, loading && styles.addButtonDisabled]}
            onPress={handleEditMethod}
            disabled={loading}
          >
            <Text style={styles.addButtonText}>
              {loading ? 'Updating...' : 'Update Method'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.title}>Payment Methods</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Shield size={24} color="#22C55E" />
          <Text style={styles.infoTitle}>Secure & Verified</Text>
          <Text style={styles.infoText}>
            Your payment methods are encrypted and verified for your security. 
            New methods are verified within 24 hours.
          </Text>
        </View>

        {/* Payment Methods List */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Linked Accounts</Text>
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
            >
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Add New</Text>
            </TouchableOpacity>
          </View>

          {paymentMethods.length === 0 ? (
            <View style={styles.emptyState}>
              <CreditCard size={64} color="#9CA3AF" />
              <Text style={styles.emptyStateTitle}>No Payment Methods</Text>
              <Text style={styles.emptyStateText}>
                Add your bank account or mobile money to enable quick deposits and withdrawals.
              </Text>
              <TouchableOpacity 
                style={styles.emptyStateButton}
                onPress={() => setShowAddModal(true)}
              >
                <Text style={styles.emptyStateButtonText}>Add Your First Method</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={paymentMethods}
              renderItem={renderPaymentMethod}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </ScrollView>

      {renderAddModal()}
      {renderEditModal()}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 24,
    marginTop: 24,
    marginBottom: 24,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  section: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#22C55E',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    padding: 32,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  emptyStateButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyStateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  methodCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  methodDetails: {
    fontSize: 14,
    color: '#6B7280',
  },
  methodStatus: {
    alignItems: 'flex-end',
  },
  defaultBadge: {
    backgroundColor: '#22C55E',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  defaultText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  pendingText: {
    fontSize: 12,
    color: '#F59E0B',
    fontWeight: '500',
  },
  methodActions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 6,
  },
  editButton: {
    backgroundColor: '#EFF6FF',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3B82F6',
  },
  defaultButton: {
    backgroundColor: '#F0FDF4',
  },
  defaultButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#22C55E',
  },
  deleteButton: {
    backgroundColor: '#FEF2F2',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#EF4444',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 20,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    color: '#1F2937',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  typeOptionActive: {
    backgroundColor: '#22C55E',
    borderColor: '#22C55E',
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  typeOptionTextActive: {
    color: '#FFFFFF',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
});


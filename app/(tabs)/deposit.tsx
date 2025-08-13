import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, ExternalLink, RefreshCw, DollarSign, CheckCircle, AlertCircle } from 'lucide-react-native';
import { Link, router } from 'expo-router';
import * as Linking from 'expo-linking';
import PINVerificationModal from '@/components/PINVerificationModal';
import * as WebBrowser from 'expo-web-browser';

export default function Deposit() {
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [webViewKey, setWebViewKey] = useState(0);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadTimeout, setLoadTimeout] = useState<NodeJS.Timeout | null>(null);
  const [amount, setAmount] = useState('');
  const [showWebView, setShowWebView] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<'pending' | 'success' | 'failed' | null>(null);
  const [showPINModal, setShowPINModal] = useState(false);
  const webViewRef = useRef<WebView>(null);

  // Construct the deposit URL with amount parameter
  const getDepositUrl = (depositAmount: string): { url: string; error: string | null } => {
    try {
      // Check if user is authenticated
      if (!user?.uid) {
        return { url: '', error: 'User not authenticated' };
      }

      // Get email from profile first, fallback to user email
      const emailToUse = profile?.email || user?.email || '';
      
      if (!emailToUse) {
        return { url: '', error: 'No email address found. Please check your profile.' };
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(emailToUse)) {
        return { url: '', error: 'Invalid email format in profile' };
      }

      // Validate amount
      if (!depositAmount || parseFloat(depositAmount) <= 0) {
        return { url: '', error: 'Please enter a valid amount' };
      }

      const baseUrl = 'https://payflow-nine.vercel.app';
      const userId = user.uid;
      // Wrap email in quotes and don't encode the @ symbol
      const userEmail = `"${emailToUse}"`;
      const amountParam = encodeURIComponent(depositAmount);
      
      const depositUrl = `${baseUrl}/${userId}?email=${userEmail}&amount=50`;
      
      return { url: depositUrl, error: null };
    } catch (error) {
      console.error('❌ Error generating deposit URL:', error);
      return { url: '', error: 'Failed to generate deposit URL' };
    }
  };

  // Get the deposit URL for WebView - must be called before any early returns
  const { url, error: urlError } = useMemo(() => {
    if (!showWebView || !amount) return { url: '', error: 'Amount not entered' };
    return getDepositUrl(amount);
  }, [showWebView, amount, user?.uid, profile?.email, user?.email]);

  const handleProceedToDeposit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount to deposit.');
      return;
    }



    // Show PIN verification modal instead of proceeding directly
    setShowPINModal(true);

  };

  const handlePINVerificationSuccess = () => {
    // PIN verified successfully - proceed with deposit
    setShowWebView(true);
    setError(null);
    setTransactionStatus('pending');
  };

  const handleBackToProfile = () => {
    router.replace('/(tabs)/profile');
  };

  const handleAmountChange = (text: string) => {
    // Only allow numbers and decimal point
    const cleaned = text.replace(/[^0-9.]/g, '');
    
    // Prevent multiple decimal points
    const parts = cleaned.split('.');
    if (parts.length > 2) return;
    
    // Limit decimal places to 2
    if (parts.length === 2 && parts[1].length > 2) return;
    
    setAmount(cleaned);
  };

  const formatAmount = (value: string) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    return num.toFixed(2);
  };

  // Clear any previous errors when URL changes
  useEffect(() => {
    if (showWebView) {
      setError(null);
    }
  }, [showWebView]);

  // Set up loading timeout
  useEffect(() => {
    if (loading && showWebView) {
      const timeout = setTimeout(() => {

        setError('Loading timeout. Please check your internet connection and try again.');
        setLoading(false);
      }, 30000); // 30 seconds timeout
      
      setLoadTimeout(timeout as any);
      
      return () => {
        if (timeout) clearTimeout(timeout);
      };
    }
  }, [loading, showWebView]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      // Cleanup timeout on unmount
      if (loadTimeout) {
        clearTimeout(loadTimeout);
      }
    };
  }, [loadTimeout]);

  const handleRefresh = () => {
    setWebViewKey(prev => prev + 1);
    setError(null);
    setLoading(true);
  };

  const handleNavigationStateChange = (navState: any) => {
    setCanGoBack(navState.canGoBack);
    setCanGoForward(navState.canGoForward);
    
    // Check if the URL indicates a successful transaction
    const currentUrl = navState.url;
    if (currentUrl) {

      
      // Check for various success indicators in the URL
      const successIndicators = ['success', 'completed', 'thank', 'confirmation', 'successful'];
      const failureIndicators = ['failed', 'error', 'cancel', 'declined', 'timeout'];
      
      const isSuccess = successIndicators.some(indicator => 
        currentUrl.toLowerCase().includes(indicator)
      );
      
      const isFailure = failureIndicators.some(indicator => 
        currentUrl.toLowerCase().includes(indicator)
      );
      
      if (isSuccess) {

        setTransactionStatus('success');
        // Auto-redirect after a short delay
        setTimeout(() => {
          handleBackToProfile();
        }, 2000);
      } else if (isFailure) {

        setTransactionStatus('failed');
        // Show error message but allow user to retry
        setError('The transaction appears to have failed. Please try again or contact support if the issue persists.');
      }
      
      // Check if we're back to the original deposit page (user might have completed payment)
      if (currentUrl.includes('payflow-nine.vercel.app') && 
          currentUrl.includes(user?.uid) && 
          !currentUrl.includes('amount=')) {
        // This might indicate the user has completed the payment and been redirected back

        // You could add additional logic here to verify completion
      }
    }
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;

    setLoading(false);
    
    // Clear timeout if it exists
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      setLoadTimeout(null);
    }
    
    setError('Failed to load the deposit page. Please check your internet connection and try again.');
  };

  const handleLoadStart = () => {
    setLoading(true);
    setError(null);
  };

  const handleLoadEnd = () => {
    setLoading(false);
    
    // Clear timeout if it exists
    if (loadTimeout) {
      clearTimeout(loadTimeout);
      setLoadTimeout(null);
    }
  };

  const handleOpenInBrowser = async () => {
    const { url, error } = getDepositUrl(amount);
    if (url) {
      try {
        let result = await WebBrowser.openBrowserAsync(url)
      } catch (error) {
        Alert.alert('Error', 'Could not open the deposit page in your browser.');
      }
    } else {
      Alert.alert('Error', error || 'Could not open the deposit page in your browser.');
    }
  };

  const handleRetryTransaction = () => {
    setError(null);
    setTransactionStatus(null);
    // Refresh the WebView to retry
    setWebViewKey(prev => prev + 1);
    setLoading(true);
  };

  const handleBackToAmount = () => {
    setShowWebView(false);
    setError(null);
    setTransactionStatus(null);
    setAmount('');
  };

  const openDepositePage = async () => {  
    const { url, error } = getDepositUrl(amount);
    if (url) {
      Linking.openURL(url).catch(err => { 
        console.error('Failed to open deposit page:', err);
        Alert.alert('Error', 'Failed to open the deposit page. Please try again later.');
      })
      setError(null);
     
    } else {
      Alert.alert('Error', error || 'Failed to open deposit page');
    }
  }

  // Show success state
  if (transactionStatus === 'success') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.successContainer}>
          <View style={styles.successIcon}>
            <CheckCircle size={80} color="#22C55E" />
          </View>
          
          <Text style={styles.successTitle}>Deposit Successful!</Text>
          <Text style={styles.successSubtitle}>
            Your deposit of ₵{formatAmount(amount)} has been processed successfully.
          </Text>
          
          <Text style={styles.successNote}>
            Redirecting you back to your profile...
          </Text>
          
          <TouchableOpacity
            style={styles.successButton}
            onPress={handleBackToProfile}
          >
            <Text style={styles.successButtonText}>Go to Profile Now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Show amount input screen if WebView is not shown yet
  if (!showWebView) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
          >
            <ArrowLeft size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={styles.title}>Deposit Money</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={handleBackToProfile}
            >
              <Text style={styles.profileButtonText}>Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        <KeyboardAvoidingView 
          style={styles.content} 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.amountContainer}>
          

            <View style={styles.balanceInfo}>
              <Text style={styles.balanceLabel}>Current Balance:</Text>
              <Text style={styles.balanceValue}>
                {profile?.walletBalance ? `₵${profile.walletBalance.toFixed(2)}` : '₵0.00'}
              </Text>
            </View>

            <View style={styles.amountInputContainer}>
              <Text style={styles.currencySymbol}>₵</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={handleAmountChange}
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                keyboardType="numeric"
                autoFocus={true}
                returnKeyType="done"
                onSubmitEditing={handleProceedToDeposit}
              />
            </View>

            {amount && parseFloat(amount) > 0 && (
              <View style={styles.depositSummary}>
                <Text style={styles.summaryTitle}>Deposit Summary</Text>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Amount:</Text>
                  <Text style={styles.summaryValue}>₵{formatAmount(amount)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Fee:</Text>
                  <Text style={styles.summaryValue}>₵0.00</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total:</Text>
                  <Text style={styles.summaryTotal}>₵{formatAmount(amount)}</Text>
                </View>
              </View>
            )}

            <TouchableOpacity
              style={[styles.proceedButton, !amount || parseFloat(amount) <= 0 ? styles.proceedButtonDisabled : null]}
              onPress={()=> openDepositePage()}
              disabled={!amount || parseFloat(amount) <= 0}
            >
              <Text style={styles.proceedButtonText}>Proceed to Payment</Text>
            </TouchableOpacity>

            <Text style={styles.amountNote}>
              You'll be redirected to our secure payment gateway to complete your deposit.
            </Text>

            <View style={styles.helpSection}>
              <Text style={styles.helpTitle}>Need Help?</Text>
              <Text style={styles.helpText}>
                • Minimum deposit: ₵1.00{'\n'}
                • Maximum deposit: ₵100,000.00{'\n'}
                • No fees for deposits{'\n'}
                • Instant processing
              </Text>
              <TouchableOpacity
                style={styles.supportButton}
                onPress={() => {
                  Alert.alert(
                    'Contact Support',
                    'For assistance with deposits, please contact our support team at support@payflow.com or call +233 XX XXX XXXX',
                    [{ text: 'OK', style: 'default' }]
                  );
                }}
              >
                <Text style={styles.supportButtonText}>Contact Support</Text>
              </TouchableOpacity>
            </View>

            {/* Debug information in development */}
            {__DEV__ && (
              <View style={styles.debugSection}>
                <Text style={styles.debugTitle}>Debug Info:</Text>
                <Text style={styles.debugText}>User ID: {user?.uid || 'None'}</Text>
                <Text style={styles.debugText}>Email: {profile?.email || user?.email || 'None'}</Text>
                <Text style={styles.debugText}>Amount: {amount || 'None'}</Text>
                <Text style={styles.debugText}>Ready to proceed: {amount && parseFloat(amount) > 0 ? 'Yes' : 'No'}</Text>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>

        {/* PIN Verification Modal */}
        <PINVerificationModal
          visible={showPINModal}
          onClose={() => setShowPINModal(false)}
          onSuccess={handlePINVerificationSuccess}
          title="Verify Your PIN"
          subtitle="Enter your 4-digit PIN to proceed with the deposit"
          amount={amount}
          operation="deposit"
        />
      </SafeAreaView>
    );
  }

  // Show error state if there's an error
  if (error) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <AlertCircle size={64} color="#EF4444" />
          </View>
          <Text style={styles.errorTitle}>Unable to Load Deposit Page</Text>
          <Text style={styles.errorText}>{error}</Text>
          
          {/* Debug information in development */}
          {__DEV__ && (
            <View style={styles.debugSection}>
              <Text style={styles.debugTitle}>Debug Info:</Text>
              <Text style={styles.debugText}>User ID: {user?.uid || 'None'}</Text>
              <Text style={styles.debugText}>Profile Email: {profile?.email || 'None'}</Text>
              <Text style={styles.debugText}>User Email: {user?.email || 'None'}</Text>
              <Text style={styles.debugText}>Amount: {amount || 'None'}</Text>
              <Text style={styles.debugText}>Profile Loaded: {profile ? 'Yes' : 'No'}</Text>
            </View>
          )}
          
          <View style={styles.errorActions}>
            <TouchableOpacity
              style={styles.errorButton}
              onPress={handleBackToAmount}
            >
              <Text style={styles.errorButtonText}>Back to Amount</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.errorButton, styles.errorButtonSecondary]}
              onPress={handleBackToProfile}
            >
              <Text style={[styles.errorButtonText, styles.errorButtonTextSecondary]}>Back to Profile</Text>
            </TouchableOpacity>

            {transactionStatus === 'failed' && (
              <TouchableOpacity
                style={[styles.errorButton, styles.errorButtonSecondary, { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB', borderWidth: 1 }]}
                onPress={handleRetryTransaction}
              >
                <Text style={[styles.errorButtonText, styles.errorButtonTextSecondary, { color: '#22C55E' }]}>Retry Transaction</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Show loading state while generating URL
  if (showWebView && !url) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22C55E" />
          <Text style={styles.loadingText}>Preparing deposit page...</Text>
          <Text style={styles.loadingSubtext}>Please wait while we set up your deposit session</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Show error state if there's a URL error
  if (showWebView && urlError) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <View style={styles.errorIcon}>
            <AlertCircle size={64} color="#EF4444" />
          </View>
          <Text style={styles.errorTitle}>Unable to Load Deposit Page</Text>
          <Text style={styles.errorText}>{urlError}</Text>
          
          <View style={styles.errorActions}>
            <TouchableOpacity
              style={styles.errorButton}
              onPress={handleBackToAmount}
            >
              <Text style={styles.errorButtonText}>Back to Amount</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.errorButton, styles.errorButtonSecondary]}
              onPress={handleBackToProfile}
            >
              <Text style={[styles.errorButtonText, styles.errorButtonTextSecondary]}>Back to Profile</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => setShowWebView(false)}
        >
          <ArrowLeft size={24} color="#374151" />
        </TouchableOpacity>
        <Text style={styles.title}>Complete Deposit</Text>
        <View style={styles.headerRight}>
          <View style={styles.amountDisplay}>
            <Text style={styles.amountLabel}>Amount:</Text>
            <Text style={styles.amountValue}>₵{formatAmount(amount)}</Text>
          </View>
          <TouchableOpacity
            style={styles.changeAmountButton}
            onPress={() => setShowWebView(false)}
          >
            <Text style={styles.changeAmountText}>Change Amount</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleRefresh}
          >
            <RefreshCw size={20} color="#374151" />
          </TouchableOpacity>
        </View>
      </View>

      {/* WebView Container */}
      <View style={styles.webViewContainer}>
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#22C55E" />
            <Text style={styles.loadingText}>Loading deposit page...</Text>
          </View>
        )}
        
        <WebView
          ref={webViewRef}
          key={webViewKey}
          source={{ uri: url }}
          style={styles.webview}
          onNavigationStateChange={handleNavigationStateChange}
          onError={handleError}
          onLoadStart={handleLoadStart}
          onLoadEnd={handleLoadEnd}
          startInLoadingState={true}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          scalesPageToFit={true}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled={true}
          decelerationRate="normal"
          onMessage={(event) => {
            // Handle messages from the web page if needed
          }}
          // Additional safety configurations
          allowsBackForwardNavigationGestures={false}
          allowsLinkPreview={false}
          cacheEnabled={false}
          incognito={true}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            if (nativeEvent.statusCode >= 400) {
              setError(`Server error (${nativeEvent.statusCode}). Please try again later.`);
            }
          }}
          onShouldStartLoadWithRequest={(request) => {
            // Only allow the deposit URL and related domains
            const allowedDomains = ['payflow-nine.vercel.app', 'vercel.app'];
            const url = request.url.toLowerCase();
            const isAllowed = allowedDomains.some(domain => url.includes(domain));
            
            if (!isAllowed) {
              return false;
            }
            
            return true;
          }}
        />
      </View>

      {/* Navigation Controls */}
      <View style={styles.navigationControls}>
        <TouchableOpacity
          style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
          onPress={() => {
            if (webViewRef.current && canGoBack) {
              webViewRef.current.goBack();
            }
          }}
          disabled={!canGoBack}
        >
          <Text style={[styles.navButtonText, !canGoBack && styles.navButtonTextDisabled]}>
            Back
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
          onPress={() => {
            if (webViewRef.current && canGoForward) {
              webViewRef.current.goForward();
            }
          }}
          disabled={!canGoForward}
        >
          <Text style={[styles.navButtonText, !canGoForward && styles.navButtonTextDisabled]}>
            Forward
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navButton}
          onPress={handleOpenInBrowser}
        >
          <ExternalLink size={16} color="#22C55E" />
          <Text style={[styles.navButtonText, { color: '#22C55E' }]}>
            Open in Browser
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.navButton, { backgroundColor: '#F3F4F6' }]}
          onPress={handleBackToProfile}
        >
          <Text style={[styles.navButtonText, { color: '#374151' }]}>
            Back to Profile
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  changeAmountButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  changeAmountText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  amountDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#22C55E',
  },
  amountLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
    marginRight: 4,
  },
  amountValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22C55E',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  amountContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  amountIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  amountTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  amountSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 24,
  },
  balanceInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#22C55E',
    marginBottom: 24,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
    marginRight: 4,
  },
  balanceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22C55E',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    minWidth: 200,
  },
  currencySymbol: {
    fontSize: 24,
    fontWeight: '600',
    color: '#22C55E',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '600',
    color: '#1F2937',
    textAlign: 'center',
  },
  amountPreview: {
    fontSize: 16,
    color: '#22C55E',
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
  },
  proceedButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    marginBottom: 24,
  },
  proceedButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  proceedButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  amountNote: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: 16,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  successIcon: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#F0FDF4',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  successTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#22C55E',
    marginBottom: 16,
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 18,
    color: '#374151',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  successNote: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  successButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  successButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  webViewContainer: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6B7280',
    fontWeight: '500',
  },
  navigationControls: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#F9FAFB',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  navButtonDisabled: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  navButtonTextDisabled: {
    color: '#9CA3AF',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
  },
  errorButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  errorButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  errorButtonSecondary: {
    backgroundColor: '#F3F4F6',
    borderColor: '#D1D5DB',
    borderWidth: 1,
  },
  errorButtonTextSecondary: {
    color: '#374151',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginTop: 16,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
    textAlign: 'center',
  },
  debugSection: {
    marginTop: 20,
    padding: 15,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    width: '100%',
    maxWidth: 300,
  },
  debugTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 10,
  },
  debugText: {
    fontSize: 12,
    color: '#4B5563',
    marginBottom: 5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  profileButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  profileButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  depositSummary: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#22C55E',
  },
  summaryTotal: {
    fontSize: 18,
    fontWeight: '700',
    color: '#22C55E',
  },
  helpSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginTop: 24,
    width: '100%',
    maxWidth: 300,
    alignItems: 'center',
  },
  helpTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
    textAlign: 'center',
  },
  helpText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  supportButton: {
    backgroundColor: '#22C55E',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 16,
  },
  supportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

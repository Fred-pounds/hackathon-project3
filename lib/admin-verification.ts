import { db } from './firebase';
import { doc, updateDoc, collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Profile } from './firebase';

// Admin verification functions
export interface VerificationRequest {
  id: string;
  profile: Profile;
  submittedAt: Date;
}

// Get all pending verification requests
export async function getPendingVerifications(): Promise<VerificationRequest[]> {
  try {
    const profilesRef = collection(db, 'profiles');
    const q = query(
      profilesRef,
      where('verificationStatus', '==', 'submitted'),
      orderBy('verificationSubmittedAt', 'desc')
    );
    
    const snapshot = await getDocs(q);
    const verifications: VerificationRequest[] = [];
    
    snapshot.forEach((doc) => {
      const data = doc.data();
      verifications.push({
        id: doc.id,
        profile: {
          id: doc.id,
          fullName: data.fullName,
          phoneNumber: data.phoneNumber,
          email: data.email,
          walletBalance: data.walletBalance,
          isVerified: data.isVerified,
          emailVerified: data.emailVerified,
          ghanaCardFrontUrl: data.ghanaCardFrontUrl,
          ghanaCardBackUrl: data.ghanaCardBackUrl,
          selfieUrl: data.selfieUrl,
          verificationStatus: data.verificationStatus,
          verificationSubmittedAt: data.verificationSubmittedAt?.toDate(),
          verificationVerifiedAt: data.verificationVerifiedAt?.toDate(),
          createdAt: data.createdAt.toDate(),
          updatedAt: data.updatedAt.toDate(),
        },
        submittedAt: data.verificationSubmittedAt?.toDate() || new Date(),
      });
    });
    
    return verifications;
  } catch (error) {
    console.error('Error fetching pending verifications:', error);
    throw error;
  }
}

// Approve user verification
export async function approveVerification(userId: string): Promise<void> {
  try {
    const userRef = doc(db, 'profiles', userId);
    await updateDoc(userRef, {
      isVerified: true,
      verificationStatus: 'verified',
      verificationVerifiedAt: new Date(),
      updatedAt: new Date(),
    });
    
    console.log(`User ${userId} verification approved`);
  } catch (error) {
    console.error('Error approving verification:', error);
    throw error;
  }
}

// Reject user verification
export async function rejectVerification(userId: string, reason?: string): Promise<void> {
  try {
    const userRef = doc(db, 'profiles', userId);
    await updateDoc(userRef, {
      verificationStatus: 'rejected',
      updatedAt: new Date(),
      // You can add a rejection reason field if needed
      // rejectionReason: reason,
    });
    
    console.log(`User ${userId} verification rejected`);
  } catch (error) {
    console.error('Error rejecting verification:', error);
    throw error;
  }
}

// Get verification statistics
export async function getVerificationStats() {
  try {
    const profilesRef = collection(db, 'profile');
    
    const [pending, verified, rejected, total] = await Promise.all([
      getDocs(query(profilesRef, where('verificationStatus', '==', 'submitted'))),
      getDocs(query(profilesRef, where('verificationStatus', '==', 'verified'))),
      getDocs(query(profilesRef, where('verificationStatus', '==', 'rejected'))),
      getDocs(profilesRef),
    ]);
    
    return {
      pending: pending.size,
      verified: verified.size,
      rejected: rejected.size,
      total: total.size,
      pendingPercentage: Math.round((pending.size / total.size) * 100),
      verifiedPercentage: Math.round((verified.size / total.size) * 100),
      rejectedPercentage: Math.round((rejected.size / total.size) * 100),
    };
  } catch (error) {
    console.error('Error fetching verification stats:', error);
    throw error;
  }
}

// Bulk approve verifications (for admin use)
export async function bulkApproveVerifications(userIds: string[]): Promise<void> {
  try {
    const batch = db.batch();
    
    userIds.forEach((userId) => {
      const userRef = doc(db, 'profiles', userId);
      batch.update(userRef, {
        isVerified: true,
        verificationStatus: 'verified',
        verificationVerifiedAt: new Date(),
        updatedAt: new Date(),
      });
    });
    
    await batch.commit();
    console.log(`Bulk approved ${userIds.length} verifications`);
  } catch (error) {
    console.error('Error bulk approving verifications:', error);
    throw error;
  }
}

// Get user verification history
export async function getUserVerificationHistory(userId: string): Promise<Profile[]> {
  try {
    const userRef = doc(db, 'profiles', userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists()) {
      throw new Error('User not found');
    }
    
    const data = userDoc.data();
    return [{
      id: userDoc.id,
      fullName: data.fullName,
      phoneNumber: data.phoneNumber,
      email: data.email,
      walletBalance: data.walletBalance,
      isVerified: data.isVerified,
      emailVerified: data.emailVerified,
      ghanaCardFrontUrl: data.ghanaCardFrontUrl,
      ghanaCardBackUrl: data.ghanaCardBackUrl,
      selfieUrl: data.selfieUrl,
      verificationStatus: data.verificationStatus,
      verificationSubmittedAt: data.verificationSubmittedAt?.toDate(),
      verificationVerifiedAt: data.verificationVerifiedAt?.toDate(),
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
    }];
  } catch (error) {
    console.error('Error fetching user verification history:', error);
    throw error;
  }
}

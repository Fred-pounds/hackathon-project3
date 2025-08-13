import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { PINData, PINVerificationResult, PINCreationResult } from '@/types/env';
import SHA256 from 'crypto-js/sha256';
import Hex from 'crypto-js/enc-hex';


const PIN_STORAGE_KEY = 'user_pin';
const PIN_ATTEMPTS_KEY = 'pin_attempts';
const MAX_PIN_ATTEMPTS = 3;
const PIN_LOCKOUT_DURATION = 5 * 60 * 1000; // 5 minutes

export class PINManager {
  // Create a new PIN for the user
  static async createPIN(userId: string, pin: string): Promise<PINCreationResult> {
    try {
      // Validate PIN format
      if (!/^\d{4}$/.test(pin)) {
        return { success: false, error: 'PIN must be exactly 4 digits' };
      }

      const pinData: PINData = {
        pin: await this.hashPIN(pin),
        createdAt: new Date(),
        lastUsed: new Date(),
        isSet: true,
      };

      // Store locally
      await AsyncStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinData));

      // Store in Firebase
      const userDocRef = doc(db, 'profiles', userId);
      await setDoc(userDocRef, { pin: pinData }, { merge: true });

      return { success: true };
    } catch (error) {
      console.error('Error creating PIN:', error);
      return { success: false, error: 'Failed to create PIN' };
    }
  }

  // Verify PIN for authentication
  static async verifyPIN(pin: string): Promise<PINVerificationResult> {
    try {
      // Check if user is locked out
      const isLockedOut = await this.isUserLockedOut();
      if (isLockedOut) {
        return { success: false, error: 'Too many failed attempts. Please wait before trying again.' };
      }

      // Get stored PIN
      const storedPinData = await AsyncStorage.getItem(PIN_STORAGE_KEY);
      if (!storedPinData) {
        return { success: false, error: 'No PIN found. Please set up your PIN first.' };
      }

      const pinData: PINData = JSON.parse(storedPinData);
      const hashedInput = await this.hashPIN(pin);

      if (hashedInput === pinData.pin) {
        // PIN is correct - reset attempts and update last used
        await this.resetPinAttempts();
        await this.updateLastUsed();
        return { success: true };
      } else {
        // PIN is incorrect - increment attempts
        await this.incrementPinAttempts();
        return { success: false, error: 'Incorrect PIN' };
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      return { success: false, error: 'Failed to verify PIN' };
    }
  }

  // Check if user has set a PIN
  static async hasPIN(): Promise<boolean> {
    try {
      const storedPinData = await AsyncStorage.getItem(PIN_STORAGE_KEY);
      if (!storedPinData) return false;

      const pinData: PINData = JSON.parse(storedPinData);
      return pinData.isSet;
    } catch (error) {
      console.error('Error checking PIN status:', error);
      return false;
    }
  }

  // Get PIN data from Firebase (for new devices)
  static async syncPINFromFirebase(userId: string): Promise<boolean> {
    try {
      const userDocRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userDocRef);

      if (userDoc.exists() && userDoc.data().pin) {
        const pinData = userDoc.data().pin as PINData;
        await AsyncStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinData));
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error syncing PIN from Firebase:', error);
      return false;
    }
  }

  // Change existing PIN
  static async changePIN(userId: string, currentPin: string, newPin: string): Promise<PINCreationResult> {
    try {
      // Verify current PIN first
      const verifyResult = await this.verifyPIN(currentPin);
      if (!verifyResult.success) {
        return { success: false, error: 'Current PIN is incorrect' };
      }

      // Create new PIN
      return await this.createPIN(userId, newPin);
    } catch (error) {
      console.error('Error changing PIN:', error);
      return { success: false, error: 'Failed to change PIN' };
    }
  }

  // Reset PIN attempts (when PIN is correct)
  private static async resetPinAttempts(): Promise<void> {
    try {
      await AsyncStorage.removeItem(PIN_ATTEMPTS_KEY);
    } catch (error) {
      console.error('Error resetting PIN attempts:', error);
    }
  }

  // Increment PIN attempts (when PIN is incorrect)
  private static async incrementPinAttempts(): Promise<void> {
    try {
      const attemptsData = await AsyncStorage.getItem(PIN_ATTEMPTS_KEY);
      const attempts = attemptsData ? JSON.parse(attemptsData) : { count: 0, lastAttempt: 0 };

      attempts.count += 1;
      attempts.lastAttempt = Date.now();

      await AsyncStorage.setItem(PIN_ATTEMPTS_KEY, JSON.stringify(attempts));
    } catch (error) {
      console.error('Error incrementing PIN attempts:', error);
    }
  }

  // Check if user is locked out due to too many attempts
  private static async isUserLockedOut(): Promise<boolean> {
    try {
      const attemptsData = await AsyncStorage.getItem(PIN_ATTEMPTS_KEY);
      if (!attemptsData) return false;

      const attempts = JSON.parse(attemptsData);
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;

      if (attempts.count >= MAX_PIN_ATTEMPTS && timeSinceLastAttempt < PIN_LOCKOUT_DURATION) {
        return true;
      }

      // Reset attempts if lockout period has passed
      if (timeSinceLastAttempt >= PIN_LOCKOUT_DURATION) {
        await this.resetPinAttempts();
      }

      return false;
    } catch (error) {
      console.error('Error checking lockout status:', error);
      return false;
    }
  }

  // Update last used timestamp
  private static async updateLastUsed(): Promise<void> {
    try {
      const storedPinData = await AsyncStorage.getItem(PIN_STORAGE_KEY);
      if (storedPinData) {
        const pinData: PINData = JSON.parse(storedPinData);
        pinData.lastUsed = new Date();
        await AsyncStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinData));
      }
    } catch (error) {
      console.error('Error updating last used timestamp:', error);
    }
  }

  // Simple PIN hashing (in production, use a more secure method)
private static async hashPIN(pin: string): Promise<string> {
  const saltedPin = pin + 'salt'; // still adding salt for basic security
  return SHA256(saltedPin).toString(Hex);
}
  // Get remaining attempts before lockout
  static async getRemainingAttempts(): Promise<number> {
    try {
      const attemptsData = await AsyncStorage.getItem(PIN_ATTEMPTS_KEY);
      if (!attemptsData) return MAX_PIN_ATTEMPTS;

      const attempts = JSON.parse(attemptsData);
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;

      if (timeSinceLastAttempt >= PIN_LOCKOUT_DURATION) {
        await this.resetPinAttempts();
        return MAX_PIN_ATTEMPTS;
      }

      return Math.max(0, MAX_PIN_ATTEMPTS - attempts.count);
    } catch (error) {
      console.error('Error getting remaining attempts:', error);
      return MAX_PIN_ATTEMPTS;
    }
  }

  // Get lockout time remaining
  static async getLockoutTimeRemaining(): Promise<number> {
    try {
      const attemptsData = await AsyncStorage.getItem(PIN_ATTEMPTS_KEY);
      if (!attemptsData) return 0;

      const attempts = JSON.parse(attemptsData);
      if (attempts.count < MAX_PIN_ATTEMPTS) return 0;

      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;
      const timeRemaining = PIN_LOCKOUT_DURATION - timeSinceLastAttempt;

      return Math.max(0, timeRemaining);
    } catch (error) {
      console.error('Error getting lockout time remaining:', error);
      return 0;
    }
  }
}

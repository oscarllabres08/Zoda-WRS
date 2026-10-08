import AsyncStorage from '@react-native-async-storage/async-storage';

import { LEGAL_VERSION } from './legalContent';

const ACCEPTED_KEY = `zoda_legal_onboarding_accepted_${LEGAL_VERSION}`;
const ACCEPTED_AT_KEY = `zoda_legal_onboarding_at_${LEGAL_VERSION}`;

export async function hasAcceptedLegalOnboarding(): Promise<boolean> {
  return (await AsyncStorage.getItem(ACCEPTED_KEY)) === '1';
}

export async function setLegalOnboardingAccepted(): Promise<string> {
  const at = new Date().toISOString();
  await AsyncStorage.multiSet([
    [ACCEPTED_KEY, '1'],
    [ACCEPTED_AT_KEY, at],
  ]);
  return at;
}

export async function getLegalOnboardingAcceptedAt(): Promise<string | null> {
  return AsyncStorage.getItem(ACCEPTED_AT_KEY);
}
